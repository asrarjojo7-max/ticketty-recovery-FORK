import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PaymentMethod, PrismaClient } from '@prisma/client';
import { AgentsService } from '../src/agents/agents.service';
import { AuditService } from '../src/common/audit/audit.service';
import type { AuthUser } from '../src/common/decorators/current-user.decorator';
import { BookingsService } from '../src/bookings/bookings.service';
import { TicketsService } from '../src/bookings/tickets.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettlementsService } from '../src/settlements/settlements.service';

describe('external agent ownership isolation (PostgreSQL)', () => {
  const owner = new PrismaClient();
  const prisma = new PrismaService();
  const audit = { log: jest.fn() } as unknown as AuditService;
  const agentsService = new AgentsService(prisma);
  const bookingsService = new BookingsService(prisma, audit);
  const ticketsService = new TicketsService(prisma, audit);
  const paymentsService = new PaymentsService(prisma);
  const settlementsService = new SettlementsService(prisma, audit);
  let organizationId: string;
  let agentOneId: string;
  let agentTwoId: string;
  let userOne: AuthUser;

  beforeAll(async () => {
    const suffix = randomUUID();
    organizationId = `test-agent-org-${suffix}`;
    const roleId = `test-agent-role-${suffix}`;
    const userOneId = `test-agent-user-1-${suffix}`;
    const userTwoId = `test-agent-user-2-${suffix}`;
    agentOneId = `test-agent-1-${suffix}`;
    agentTwoId = `test-agent-2-${suffix}`;
    const templateId = `test-agent-template-${suffix}`;
    const busId = `test-agent-bus-${suffix}`;
    const routeId = `test-agent-route-${suffix}`;
    const tripId = `test-agent-trip-${suffix}`;

    await owner.organization.create({
      data: {
        id: organizationId,
        name: 'Agent Isolation',
        slug: organizationId,
      },
    });
    await owner.role.create({
      data: {
        id: roleId,
        organizationId,
        key: 'AGENT',
        nameAr: 'وكيل',
        nameEn: 'Agent',
        permissions: ['bookings.read', 'tickets.read', 'payments.read'],
      },
    });
    await owner.user.createMany({
      data: [userOneId, userTwoId].map((id, index) => ({
        id,
        organizationId,
        roleId,
        name: `Agent User ${index + 1}`,
        email: `${id}@example.invalid`,
        passwordHash: 'not-a-real-hash',
      })),
    });
    await owner.seatTemplate.create({
      data: {
        id: templateId,
        organizationId,
        name: 'Test',
        rows: 1,
        columnsPerRow: 2,
        aisleAfterColumn: 1,
      },
    });
    await owner.bus.create({
      data: {
        id: busId,
        organizationId,
        plateNumber: `AGENT-${suffix}`,
        seatTemplateId: templateId,
      },
    });
    await owner.route.create({
      data: {
        id: routeId,
        organizationId,
        name: 'Agent route',
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
      },
    });
    await owner.agent.createMany({
      data: [
        {
          id: agentOneId,
          organizationId,
          userId: userOneId,
          name: 'Agent One',
        },
        {
          id: agentTwoId,
          organizationId,
          userId: userTwoId,
          name: 'Agent Two',
        },
      ],
    });
    const seatIds = [
      `test-agent-seat-1-${suffix}`,
      `test-agent-seat-2-${suffix}`,
    ];
    await owner.tripSeat.createMany({
      data: seatIds.map((id, index) => ({
        id,
        tripId,
        row: 1,
        column: index + 1,
        label: `${index + 1}`,
        price: 100,
        status: 'BOOKED',
      })),
    });
    for (const [index, agentId] of [agentOneId, agentTwoId].entries()) {
      const bookingId = `test-agent-booking-${index}-${suffix}`;
      await owner.booking.create({
        data: {
          id: bookingId,
          organizationId,
          tripId,
          agentId,
          createdById: index ? userTwoId : userOneId,
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
          receivedById: index ? userTwoId : userOneId,
        },
      });
      await owner.ticket.create({
        data: {
          organizationId,
          bookingId,
          tripId,
          tripSeatId: seatIds[index],
          number: `T-${index}-${suffix}`,
          passengerName: `Passenger ${index}`,
          passengerPhone: '000',
          seatLabel: `${index + 1}`,
          fare: 100,
          qrCode: `QR-${index}-${suffix}`,
        },
      });
      await owner.settlement.create({
        data: {
          organizationId,
          agentId,
          fromDate: new Date('2026-08-01'),
          toDate: new Date('2026-08-02'),
        },
      });
    }
    userOne = {
      sub: userOneId,
      orgId: organizationId,
      branchId: null,
      name: 'Agent One',
      email: `${userOneId}@example.invalid`,
      roleKey: 'AGENT',
      permissions: [
        'bookings.read.own',
        'tickets.read.own',
        'payments.read.own',
        'agents.read.own',
        'settlements.read.own',
      ],
    };
  });

  afterAll(async () => {
    await owner.settlement.deleteMany({
      where: { agentId: { in: [agentOneId, agentTwoId] } },
    });
    await owner.commission.deleteMany({ where: { organizationId } });
    await owner.ticket.deleteMany({ where: { organizationId } });
    await owner.refund.deleteMany({ where: { organizationId } });
    await owner.payment.deleteMany({ where: { organizationId } });
    await owner.booking.deleteMany({ where: { organizationId } });
    await owner.tripSeat.deleteMany({ where: { trip: { organizationId } } });
    await owner.trip.deleteMany({ where: { organizationId } });
    await owner.agent.deleteMany({ where: { organizationId } });
    await owner.bus.deleteMany({ where: { organizationId } });
    await owner.route.deleteMany({ where: { organizationId } });
    await owner.seatTemplate.deleteMany({ where: { organizationId } });
    await owner.user.deleteMany({ where: { organizationId } });
    await owner.role.deleteMany({ where: { organizationId } });
    await owner.organization.delete({ where: { id: organizationId } });
    await Promise.all([owner.$disconnect(), prisma.$disconnect()]);
  });

  it('returns only resources owned by the authenticated agent', async () => {
    const [agents, bookings, tickets, payments, settlements] =
      await prisma.withTenantContext(organizationId, () =>
        Promise.all([
          agentsService.findAll(userOne, {}),
          bookingsService.findAll(userOne, {}),
          ticketsService.findAll(userOne, {}),
          paymentsService.findAll(userOne, {}),
          settlementsService.findAll(userOne, {}),
        ]),
      );
    expect(agents.map((item) => item.id)).toEqual([agentOneId]);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]?.agentId).toBe(agentOneId);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.booking.agentId).toBe(agentOneId);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.booking.agentId).toBe(agentOneId);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]?.agentId).toBe(agentOneId);
  });

  it('does not expose another agent by direct identifier', async () => {
    await expect(
      prisma.withTenantContext(organizationId, () =>
        agentsService.findOne(userOne, agentTwoId),
      ),
    ).rejects.toThrow();
  });
});
