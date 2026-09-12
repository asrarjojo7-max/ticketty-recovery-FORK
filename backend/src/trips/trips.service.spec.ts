import { ConflictException, NotFoundException } from '@nestjs/common';
import { DriverStatus } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from './trips.service';

const user: AuthUser = {
  sub: 'user-1',
  orgId: 'org-1',
  branchId: null,
  name: 'Test',
  email: 'test@example.com',
  roleKey: 'OPS_MANAGER',
  permissions: ['trips.write'],
};

function baseTripRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'existing-trip',
    departureAt: new Date('2026-09-10T10:00:00Z'),
    arrivalAt: new Date('2026-09-10T14:00:00Z'),
    ...overrides,
  };
}

describe('TripsService scheduling overlap guard (create)', () => {
  const findFirst = jest.fn();
  const tripCreate = jest.fn();
  const prisma = {
    route: {
      findFirst: jest.fn().mockResolvedValue({ id: 'route-1', branchId: null }),
    },
    bus: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'bus-1',
        status: 'READY',
        branchId: null,
        seatTemplate: { seats: [] },
      }),
    },
    driver: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'driver-1',
        status: DriverStatus.ACTIVE,
        licenseExpiry: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      }),
    },
    trip: { findFirst, create: tripCreate },
  } as unknown as PrismaService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  const service = new TripsService(prisma, audit);

  const dto = {
    routeId: 'route-1',
    busId: 'bus-1',
    driverId: 'driver-1',
    departureAt: new Date('2026-09-10T13:00:00Z').toISOString(),
    arrivalAt: new Date('2026-09-10T16:00:00Z').toISOString(),
    price: 100,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (
      prisma as unknown as {
        route: { findFirst: jest.Mock };
      }
    ).route.findFirst.mockResolvedValue({ id: 'route-1', branchId: null });
    (
      prisma as unknown as {
        bus: { findFirst: jest.Mock };
      }
    ).bus.findFirst.mockResolvedValue({
      id: 'bus-1',
      status: 'READY',
      branchId: null,
      seatTemplate: { seats: [] },
    });
    tripCreate.mockResolvedValue({ id: 'new-trip' });
  });

  it('rejects a bus already booked in an overlapping window', async () => {
    findFirst.mockResolvedValue(baseTripRow());

    await expect(service.create(user, dto)).rejects.toThrow(ConflictException);
    await expect(service.create(user, dto)).rejects.toThrow(/الحافلة مشغولة/);
  });

  it('rejects a driver double-booking even on a different bus', async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(baseTripRow());

    await expect(service.create(user, dto)).rejects.toThrow(/السائق مشغول/);
  });

  it('allows creation when no overlaps exist', async () => {
    findFirst.mockResolvedValue(null);

    await service.create(user, dto);
    expect(tripCreate).toHaveBeenCalledTimes(1);
  });

  it('still validates the bus readiness before overlap checks', async () => {
    (
      prisma as unknown as {
        bus: { findFirst: jest.Mock };
      }
    ).bus.findFirst.mockResolvedValue({
      id: 'bus-1',
      status: 'MAINTENANCE',
      branchId: null,
      seatTemplate: { seats: [] },
    });

    await expect(service.create(user, dto)).rejects.toThrow(
      /لا يمكن إنشاء رحلة على باص غير جاهز/,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the route does not exist', async () => {
    (
      prisma as unknown as {
        route: { findFirst: jest.Mock };
      }
    ).route.findFirst.mockResolvedValue(null);

    await expect(service.create(user, dto)).rejects.toThrow(NotFoundException);
  });
});

/* ── خريطة مقاعد الرحلة: الترقيم الرقمي + الملخص + معلومات الحافلة ── */

describe('TripsService seats() — realistic coach map payload', () => {
  function seatRow(
    row: number,
    column: number,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: `seat-${row}-${column}`,
      tripId: 'trip-1',
      row,
      column,
      label: String((row - 1) * 4 + column), // ترقيم رقمي رسمي
      seatType: 'REGULAR',
      status: 'AVAILABLE',
      price: 2500,
      ...overrides,
    };
  }

  function buildTrip(overrides: Record<string, unknown> = {}) {
    const seats = [];
    for (let r = 1; r <= 10; r++) {
      for (let c = 1; c <= 4; c++) seats.push(seatRow(r, c));
    }
    return {
      id: 'trip-1',
      departureAt: new Date('2026-09-10T10:00:00Z'),
      arrivalAt: new Date('2026-09-10T14:00:00Z'),
      status: 'OPEN',
      driverName: 'سائق',
      driverPhone: null,
      routeId: 'route-1',
      busId: 'bus-1',
      route: { stops: [] },
      bus: {
        id: 'bus-1',
        plateNumber: 'SDN-1101',
        seatTemplate: {
          id: 'tpl-1',
          rows: 10,
          columnsPerRow: 4,
          aisleAfterColumn: 2,
          seats: seats.map((s) => ({
            row: s.row,
            column: s.column,
            seatType: s.seatType,
          })),
        },
      },
      tripSeats: seats,
      ...overrides,
    };
  }

  function makeService(trip: unknown) {
    const tripSeatUpdate = jest.fn();
    const ticketFindMany = jest.fn().mockResolvedValue([]);
    const ticketUpdate = jest.fn();
    const transaction = jest.fn<
      Promise<unknown>,
      [fn: (tx: PrismaService) => unknown]
    >();
    const rawPrisma = {
      trip: { findFirst: jest.fn().mockResolvedValue(trip) },
      tripSeat: {
        createMany: jest.fn(),
        update: tripSeatUpdate,
        updateMany: jest.fn(),
        findMany: jest
          .fn()
          .mockImplementation(({ where }: { where: { tripId: string } }) =>
            Promise.resolve(
              (
                trip as { tripSeats: ReturnType<typeof seatRow>[] }
              ).tripSeats.filter((seat) => seat.tripId === where.tripId),
            ),
          ),
      },
      ticket: { findMany: ticketFindMany, update: ticketUpdate },
      $transaction: transaction,
    };
    const prisma = rawPrisma as unknown as PrismaService;
    transaction.mockImplementation((fn) => Promise.resolve(fn(prisma)));
    const audit = { log: jest.fn() } as unknown as AuditService;
    return {
      service: new TripsService(prisma, audit),
      transaction,
      tripSeatUpdate,
      ticketFindMany,
      ticketUpdate,
    };
  }

  it('returns summary counts and physical layout metadata', async () => {
    const trip = buildTrip();
    // مقعدان مبيعان + واحد محجوز لغيرك
    trip.tripSeats[0].status = 'BOOKED';
    trip.tripSeats[1].status = 'BOOKED';
    trip.tripSeats[2].status = 'HELD';
    const { service } = makeService(trip);

    const res = await service.seats(user, 'trip-1');

    expect(res.summary).toEqual({ total: 40, sold: 2, available: 37 });
    expect(res.layout).toMatchObject({
      rows: 10,
      columnsPerRow: 4,
      aisleAfterColumn: 2,
      driverPosition: 'FRONT_LEFT',
      entranceDoor: 'FRONT_RIGHT',
      rearDoor: 'LEFT',
    });
    expect(res.trip.bus).toMatchObject({
      plateNumber: 'SDN-1101',
      totalSeats: 40,
    });
  });

  it('migrates legacy letter labels to numeric via ONE interactive transaction', async () => {
    const trip = buildTrip();
    // تذاكر قديمة بحروف (A1)
    trip.tripSeats = trip.tripSeats.map((s) => ({
      ...s,
      label: `${String.fromCharCode(64 + s.column)}${s.row}`,
    }));
    const { service, transaction, tripSeatUpdate } = makeService(trip);

    await service.seats(user, 'trip-1');

    // معاملة تفاعلية واحدة (نموذج الدالة) — وكيل RLS لا يقبل المصفوفات
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(typeof transaction.mock.calls[0][0]).toBe('function');
    // كل المقاعد الحرفية حُوّلت لأرقام من الموضع
    expect(tripSeatUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'seat-1-1' },
        data: { label: '1' },
      }),
    );
    expect(tripSeatUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'seat-10-4' },
        data: { label: '40' },
      }),
    );
  });

  it('updates ticket seat labels alongside the seat migration', async () => {
    const trip = buildTrip();
    trip.tripSeats = trip.tripSeats.map((s) => ({
      ...s,
      label: `${String.fromCharCode(64 + s.column)}${s.row}`,
    }));
    const { service, ticketFindMany, ticketUpdate } = makeService(trip);
    ticketFindMany.mockResolvedValue([
      { id: 'ticket-1', tripSeatId: 'seat-1-1' },
      { id: 'ticket-2', tripSeatId: 'seat-3-2' },
    ]);

    await service.seats(user, 'trip-1');

    expect(ticketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-1' },
        data: { seatLabel: '1' },
      }),
    );
    expect(ticketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ticket-2' },
        data: { seatLabel: '10' },
      }),
    );
  });

  it('skips the migration entirely when all labels are already numeric', async () => {
    const trip = buildTrip(); // أصلًا رقمي
    const { service, transaction } = makeService(trip);

    await service.seats(user, 'trip-1');

    expect(transaction).not.toHaveBeenCalled();
  });
});
