import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PaymentMethod, PrismaClient } from '@prisma/client';
import { BookingsService } from '../src/bookings/bookings.service';
import { AuditService } from '../src/common/audit/audit.service';
import type { AuthUser } from '../src/common/decorators/current-user.decorator';
import { PrismaService } from '../src/prisma/prisma.service';
import { TripsService } from '../src/trips/trips.service';

jest.setTimeout(15_000);

describe('refund integrity concurrency (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writer = new PrismaClient();
  let organizationId: string;
  let bookingId: string;
  let paymentId: string;

  beforeAll(async () => {
    const suffix = randomUUID();
    organizationId = `test-org-${suffix}`;
    bookingId = `test-booking-${suffix}`;
    paymentId = `test-payment-${suffix}`;
    const templateId = `test-template-${suffix}`;
    const busId = `test-bus-${suffix}`;
    const routeId = `test-route-${suffix}`;
    const tripId = `test-trip-${suffix}`;

    await prisma.organization.create({
      data: {
        id: organizationId,
        name: 'Concurrency Test',
        slug: organizationId,
      },
    });
    await prisma.seatTemplate.create({
      data: {
        id: templateId,
        organizationId,
        name: 'Test',
        rows: 1,
        columnsPerRow: 1,
        aisleAfterColumn: 1,
      },
    });
    await prisma.bus.create({
      data: {
        id: busId,
        organizationId,
        plateNumber: `TEST-${suffix}`,
        seatTemplateId: templateId,
      },
    });
    await prisma.route.create({
      data: {
        id: routeId,
        organizationId,
        name: 'Concurrency route',
        fromCity: 'A',
        toCity: 'B',
      },
    });
    await prisma.trip.create({
      data: {
        id: tripId,
        organizationId,
        routeId,
        busId,
        departureAt: new Date(),
      },
    });
    await prisma.booking.create({
      data: {
        id: bookingId,
        organizationId,
        tripId,
        createdById: 'test-user',
        totalAmount: 100,
        status: 'CONFIRMED',
      },
    });
    await prisma.payment.create({
      data: {
        id: paymentId,
        organizationId,
        bookingId,
        amount: 100,
        method: PaymentMethod.CASH,
        receivedById: 'test-user',
      },
    });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } });
    await Promise.all([prisma.$disconnect(), writer.$disconnect()]);
  });

  it('serializes concurrent refunds and rejects the cumulative over-refund', async () => {
    let signalInserted: (() => void) | undefined;
    const inserted = new Promise<void>((resolve) => {
      signalInserted = resolve;
    });

    const first = prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          organizationId,
          bookingId,
          paymentId,
          amount: 60,
          reason: 'first concurrent refund',
          processedById: 'test-user',
        },
      });
      signalInserted?.();
      await tx.$executeRaw`SELECT pg_sleep(0.2)`;
    });

    await inserted;
    const second = writer.$transaction((tx) =>
      tx.refund.create({
        data: {
          organizationId,
          bookingId,
          paymentId,
          amount: 50,
          reason: 'second concurrent refund',
          processedById: 'test-user',
        },
      }),
    );

    const results = await Promise.allSettled([first, second]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);

    const [payment, refunds] = await Promise.all([
      prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      prisma.refund.findMany({ where: { paymentId, status: 'COMPLETED' } }),
    ]);
    expect(payment.refundedAmount.toNumber()).toBe(60);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount.toNumber()).toBe(60);
  });
});

describe('booking cancellation versus trip cancellation', () => {
  const owner = new PrismaClient();
  const bookingClient = new PrismaService();
  const tripClient = new PrismaService();
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const bookings = new BookingsService(bookingClient, audit);
  const trips = new TripsService(tripClient, audit);
  let organizationId: string;
  let tripId: string;
  let bookingId: string;
  const user = {} as AuthUser;

  beforeAll(async () => {
    const suffix = randomUUID();
    organizationId = `test-race-org-${suffix}`;
    tripId = `test-race-trip-${suffix}`;
    bookingId = `test-race-booking-${suffix}`;
    Object.assign(user, {
      sub: 'test-user',
      orgId: organizationId,
      branchId: null,
      name: 'Test',
      email: 'test@example.com',
      roleKey: 'OWNER',
      permissions: ['*'],
    });
    const templateId = `test-race-template-${suffix}`;
    const busId = `test-race-bus-${suffix}`;
    const routeId = `test-race-route-${suffix}`;
    await owner.organization.create({
      data: { id: organizationId, name: 'Race Test', slug: organizationId },
    });
    await owner.seatTemplate.create({
      data: {
        id: templateId,
        organizationId,
        name: 'Test',
        rows: 1,
        columnsPerRow: 1,
        aisleAfterColumn: 1,
      },
    });
    await owner.bus.create({
      data: {
        id: busId,
        organizationId,
        plateNumber: `RACE-${suffix}`,
        seatTemplateId: templateId,
      },
    });
    await owner.route.create({
      data: {
        id: routeId,
        organizationId,
        name: 'Race route',
        fromCity: 'A',
        toCity: 'B',
      },
    });
    await owner.trip.create({
      data: {
        id: tripId,
        organizationId,
        routeId,
        busId,
        departureAt: new Date(),
        status: 'OPEN',
      },
    });
    await owner.booking.create({
      data: {
        id: bookingId,
        organizationId,
        tripId,
        createdById: user.sub,
        totalAmount: 100,
        status: 'CONFIRMED',
      },
    });
    await owner.payment.create({
      data: {
        organizationId,
        bookingId,
        amount: 100,
        method: PaymentMethod.CASH,
        receivedById: user.sub,
      },
    });
  });

  afterAll(async () => {
    await owner.organization.delete({ where: { id: organizationId } });
    await Promise.all([
      owner.$disconnect(),
      bookingClient.$disconnect(),
      tripClient.$disconnect(),
    ]);
  });

  it('never leaves duplicate refunds or a confirmed booking on a cancelled trip', async () => {
    const outcomes = await Promise.allSettled([
      bookingClient.withTenantContext(organizationId, () =>
        bookings.cancel(
          user,
          bookingId,
          'customer cancellation',
          'booking-cancel-key',
        ),
      ),
      tripClient.withTenantContext(organizationId, () =>
        trips.cancel(
          user,
          tripId,
          'operator cancellation',
          'trip-cancel-key-1',
        ),
      ),
    ]);
    if (outcomes[1]?.status === 'rejected') throw outcomes[1].reason;

    const [booking, trip, refunds] = await Promise.all([
      owner.booking.findUniqueOrThrow({ where: { id: bookingId } }),
      owner.trip.findUniqueOrThrow({ where: { id: tripId } }),
      owner.refund.findMany({ where: { bookingId } }),
    ]);
    expect(trip.status).toBe('CANCELLED');
    expect(booking.status).not.toBe('CONFIRMED');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount.toNumber()).toBe(100);
  });
});
