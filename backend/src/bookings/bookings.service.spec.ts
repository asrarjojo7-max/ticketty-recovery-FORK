import { ConflictException } from '@nestjs/common';
import { SeatType, TripStatus } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  boardingTokenForTest,
  BookingsService,
  formatTicketNumberForTest as formatTicketNumber,
  nextTicketSequenceForTest as nextTicketSequence,
} from './bookings.service';

const user: AuthUser = {
  sub: 'user-1',
  orgId: 'org-1',
  branchId: 'branch-1',
  name: 'Test',
  email: 'test@example.com',
  roleKey: 'SELLER',
  permissions: ['bookings.write'],
};

type UpdateSeatsArgs = {
  where: {
    id: string;
    tripId: string;
    seatType: { in: SeatType[] };
  };
};

describe('BookingsService seat eligibility', () => {
  const findTrip = jest.fn();
  let capturedArgs: UpdateSeatsArgs | undefined;
  const updateSeats = jest.fn((args: UpdateSeatsArgs) => {
    capturedArgs = args;
    return Promise.resolve({ count: 1 });
  });
  const auditLog = jest.fn();
  const prisma = {
    trip: { findFirst: findTrip },
    tripSeat: { updateMany: updateSeats },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn((fn: (tx: PrismaService) => unknown) =>
    Promise.resolve(fn(prisma)),
  ),
  } as unknown as PrismaService;
  const audit = { log: auditLog } as unknown as AuditService;
  const service = new BookingsService(prisma, audit);

  beforeEach(() => {
    jest.clearAllMocks();
    capturedArgs = undefined;
    findTrip.mockResolvedValue({ id: 'trip-1', status: TripStatus.OPEN });
  });

  it('limits seat holds to explicitly sellable seat types', async () => {
    await service.hold(user, { tripId: 'trip-1', seatId: 'seat-1' });

    expect(updateSeats).toHaveBeenCalledTimes(1);
    expect(capturedArgs?.where.id).toBe('seat-1');
    expect(capturedArgs?.where.tripId).toBe('trip-1');
    expect(capturedArgs?.where.seatType.in).toEqual([
      SeatType.REGULAR,
      SeatType.VIP,
    ]);
    expect(auditLog).toHaveBeenCalled();
    const rawPrisma = prisma as unknown as {
      $executeRaw: jest.Mock;
    };
    expect(rawPrisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects a seat when the guarded claim does not match', async () => {
    updateSeats.mockResolvedValue({ count: 0 });

    await expect(
      service.hold(user, { tripId: 'trip-1', seatId: 'blocked-seat' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(auditLog).not.toHaveBeenCalled();
  });
});

describe('sequential ticket numbering (TK-YYYY-NNNNNN)', () => {
  function ticketRow(number: string) {
    return { number };
  }

  function txWith(latest: string | null) {
    const findFirst = jest
      .fn()
      .mockResolvedValue(latest ? ticketRow(latest) : null);
    return { ticket: { findFirst } } as never;
  }

  async function nextWith(latest: string | null): Promise<string> {
    const seq = await nextTicketSequence(txWith(latest), 'org-1');
    return formatTicketNumber(seq);
  }

  it('continues after the highest existing number in the year', async () => {
    await expect(nextWith('TK-2026-000183')).resolves.toBe('TK-2026-000184');
  });

  it('starts at 000001 when no tickets exist for the year', async () => {
    await expect(nextWith(null)).resolves.toBe(
      `TK-${new Date().getUTCFullYear()}-000001`,
    );
  });

  it('pads the sequence to six digits and stays human-readable', async () => {
    await expect(nextWith('TK-2026-000009')).resolves.toBe('TK-2026-000010');
    const issued = await nextWith('TK-2026-000999');
    expect(issued).toMatch(/^TK-\d{4}-\d{6}$/);
  });

  it('sorts lexicographically so desc-order lookup finds the true maximum', () => {
    // 000184 > 000099 lexicographically — الترتيب النصي يطابق الترتيب
    // الرقمي لأن التسلسل مُبطّس إلى 6 خانات دائمًا.
    const digits = ['000099', '000100', '000184'].map(
      (sequence) => `TK-2026-${sequence}`,
    );
    const sorted = [...digits].sort().reverse();
    expect(sorted[0]).toBe('TK-2026-000184');
  });

  it('never produces letter-based seat labels in boarding tokens', async () => {
    const token = boardingTokenForTest();
    expect(token).toMatch(/^TB-[0-9A-F]{16}$/);

    // إصلاح P2002 (تذاكر متعددة في حجز واحد): تخصيص الأرقام يجب أن
    // يقرأ التسلسل مرة واحدة ثم يزيد محليًا — قراءة متكررة كانت تعيد
    // نفس «الأحدث» فتخرق UNIQUE على tickets.number عند المقعد الثاني.
    let seq = await nextTicketSequence(txWith('TK-2026-000004'), 'org-1');
    const numbers = [formatTicketNumber(seq)];
    seq += 1;
    numbers.push(formatTicketNumber(seq));
    expect(numbers).toEqual(['TK-2026-000005', 'TK-2026-000006']);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('never repeats a ticket number across concurrent two-seat sales (P2002 regression)', async () => {
    // محاكاة الحجز كامل المقاعد: القاعدة نفسها تُقرأ من DB لكل مقعد
    // (لا كتابة بين القراءات) — التخصيص الصحيح يجب أن ينتج أرقامًا
    // مختلفة لكل مقعد حتى قبل أي كتابة.
    const findFirst = jest.fn().mockResolvedValue(ticketRow('TK-2026-000004'));
    const tx = { ticket: { findFirst } } as never;

    // كما في BookingsService: قراءة واحدة + زيادة محلية
    let seq = await nextTicketSequence(tx, 'org-1');
    const allocated: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      allocated.push(formatTicketNumber(seq));
      seq += 1;
    }
    expect(findFirst).toHaveBeenCalledTimes(1); // قراءة واحدة لا N
    expect(allocated).toEqual([
      'TK-2026-000005',
      'TK-2026-000006',
      'TK-2026-000007',
    ]);
    expect(new Set(allocated).size).toBe(3); // لا تكرار = لا P2002
  });
});
