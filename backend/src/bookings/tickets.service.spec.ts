import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  TicketValidationCode,
  TicketsService,
  toPayloadHelpers,
} from './tickets.service';

const user: AuthUser = {
  sub: 'gate-1',
  orgId: 'org-1',
  branchId: null,
  name: 'Gate Operator',
  email: 'gate@example.com',
  roleKey: 'STATION_MANAGER',
  permissions: ['tickets.read', 'tickets.write'],
};

type TicketRowOverrides = {
  status?: 'BOOKED' | 'CHECKED_IN' | 'CANCELLED' | 'REFUNDED' | 'NO_SHOW';
  tripStatus?:
    'SCHEDULED' | 'OPEN' | 'FULL' | 'DEPARTED' | 'COMPLETED' | 'CANCELLED';
  tripId?: string;
  paidAmount?: string;
  fareAmount?: string;
};

const baseTicketRow = (overrides: TicketRowOverrides = {}) => ({
  id: 'ticket-1',
  number: 'TK-2026-000184',
  boardingToken: 'TB-ABC123DEF4567890',
  qrCode: 'qr-uuid-1',
  passengerName: 'مجاهد ادم',
  passengerPhone: '09990001111',
  passengerNationalId: 'NID-1',
  seatLabel: '17',
  boardingStop: 'الخرطوم',
  dropOffStop: 'بورتسودان',
  fare: new Prisma.Decimal(overrides.fareAmount ?? '25000.00'),
  status: overrides.status ?? 'BOOKED',
  boardedAt: null,
  tripId: overrides.tripId ?? 'trip-1',
  trip: {
    id: overrides.tripId ?? 'trip-1',
    status: overrides.tripStatus ?? 'OPEN',
    departureAt: new Date('2026-09-24T08:00:00Z'),
    driverName: 'السائق أحمد',
    route: {
      name: 'الخرطوم - بورتسودان',
      fromCity: 'الخرطوم',
      toCity: 'بورتسودان',
    },
    bus: { plateNumber: 'SDN-1101', model: 'مرسيدس ترافكو' },
  },
  booking: {
    id: 'booking-1',
    status: 'CONFIRMED',
    payments: [
      {
        amount: new Prisma.Decimal(overrides.paidAmount ?? '25000.00'),
        refundedAmount: new Prisma.Decimal(0),
      },
    ],
  },
});

describe('TicketsService.validate — boarding gate authority', () => {
  const findFirst = jest.fn();
  const auditLog = jest.fn();
  const prisma = {
    ticket: { findFirst },
  } as unknown as PrismaService;
  const audit = { log: auditLog } as unknown as AuditService;
  const service = new TicketsService(prisma, audit);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function expectCode(code: TicketValidationCode) {
    return expect(
      service.validate(user, 'TB-ABC123DEF4567890'),
    ).resolves.toMatchObject({
      code,
    });
  }

  it('returns NOT_FOUND for an unknown scan code (no ticket leak)', async () => {
    findFirst.mockResolvedValue(null);

    const result = await service.validate(user, 'TB-DOES-NOT-EXIST');

    expect(result.code).toBe('NOT_FOUND');
    expect(result.boardable).toBe(false);
    expect(result.ticket).toBeNull();
    // المسح الفاشل يُدوَّن — لا تسريب للقيمة كاملة (بادئة فقط)
    expect(auditLog).toHaveBeenCalledWith(
      user,
      'TICKET_SCAN_NOT_FOUND',
      'Ticket',
      undefined,
      { codePrefix: 'TB-D' },
    );
  });

  it('returns VALID for a paid, booked, open-trip ticket', async () => {
    findFirst.mockResolvedValue(baseTicketRow());

    const result = await service.validate(user, 'TB-ABC123DEF4567890');

    expect(result.code).toBe('VALID');
    expect(result.boardable).toBe(true);
    expect(result.ticket).toMatchObject({
      number: 'TK-2026-000184',
      seatLabel: '17',
      passengerName: 'مجاهد ادم',
    });
  });

  it('returns ALREADY_BOARDED when the passenger already boarded', async () => {
    findFirst.mockResolvedValue(baseTicketRow({ status: 'CHECKED_IN' }));

    await expectCode('ALREADY_BOARDED');
  });

  it('returns CANCELLED for a cancelled ticket', async () => {
    findFirst.mockResolvedValue(baseTicketRow({ status: 'CANCELLED' }));

    await expectCode('CANCELLED');
  });

  it('returns REFUNDED for a refunded ticket', async () => {
    findFirst.mockResolvedValue(baseTicketRow({ status: 'REFUNDED' }));

    await expectCode('REFUNDED');
  });

  it('returns PAYMENT_PENDING when paid amount is below the fare', async () => {
    findFirst.mockResolvedValue(
      baseTicketRow({ paidAmount: '10000.00', fareAmount: '25000.00' }),
    );

    const result = await service.validate(user, 'TB-ABC123DEF4567890');
    expect(result.code).toBe('PAYMENT_PENDING');
    expect(result.boardable).toBe(false);
  });

  it('returns BOARDING_CLOSED when the trip already departed', async () => {
    findFirst.mockResolvedValue(baseTicketRow({ tripStatus: 'DEPARTED' }));

    const result = await service.validate(user, 'TB-ABC123DEF4567890');
    expect(result.code).toBe('BOARDING_CLOSED');
  });

  it('returns BOARDING_CLOSED when the trip was cancelled', async () => {
    findFirst.mockResolvedValue(baseTicketRow({ tripStatus: 'CANCELLED' }));

    await expectCode('BOARDING_CLOSED');
  });

  it('returns WRONG_TRIP when validating against a different trip gate', async () => {
    findFirst.mockResolvedValue(baseTicketRow({ tripId: 'trip-1' }));

    const result = await service.validate(
      user,
      'TB-ABC123DEF4567890',
      'trip-other',
    );
    expect(result.code).toBe('WRONG_TRIP');
    expect(result.boardable).toBe(false);
  });

  it('keeps VALID when the trip gate matches the ticket trip', async () => {
    findFirst.mockResolvedValue(baseTicketRow({ tripId: 'trip-1' }));

    const result = await service.validate(
      user,
      'TB-ABC123DEF4567890',
      'trip-1',
    );
    expect(result.code).toBe('VALID');
  });
});

describe('seat labels stay numeric end-to-end', () => {
  it('payload exposes the seat label as stored (numeric)', () => {
    const row = baseTicketRow();
    // toPayload is exercised through validate above; here we assert the
    // seat field surfaces as the plain numeric label from the DB row.
    const payloadResult = toPayloadHelpers.seatLabelOf(row);
    expect(payloadResult).toBe('17');
    expect(payloadResult).toMatch(/^\d+$/);
  });
});

describe('TicketsService.markPrinted ownership boundary', () => {
  const ownUser: AuthUser = {
    ...user,
    sub: 'agent-user-1',
    branchId: 'branch-1',
    permissions: ['tickets.write.own'],
  };
  const findAgent = jest.fn().mockResolvedValue({ id: 'agent-1' });
  const updateMany = jest.fn();
  const auditLog = jest.fn();
  const prisma = {
    agent: { findFirst: findAgent },
    ticket: { updateMany },
  } as unknown as PrismaService;
  const service = new TicketsService(prisma, {
    log: auditLog,
  } as unknown as AuditService);

  beforeEach(() => jest.clearAllMocks());

  it('constrains own-scope updates and returns no passenger PII', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const result = await service.markPrinted(ownUser, 'ticket-2');

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ticket-2',
        organizationId: 'org-1',
        trip: { branchId: 'branch-1' },
        booking: { agentId: 'agent-1' },
      },
      data: {
        printedAt: result.printedAt,
        printedById: 'agent-user-1',
      },
    });
    expect(result).toMatchObject({ id: 'ticket-2', printed: true });
    expect(result).not.toHaveProperty('passengerName');
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the scoped ticket update matches nothing', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.markPrinted(ownUser, 'ticket-other'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auditLog).not.toHaveBeenCalled();
  });
});
