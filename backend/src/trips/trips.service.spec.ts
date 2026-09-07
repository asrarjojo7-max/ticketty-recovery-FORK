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
