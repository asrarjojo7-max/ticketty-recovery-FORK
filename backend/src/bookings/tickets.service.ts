import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketStatus, TripStatus } from '@prisma/client';
import { resolveAgentId } from '../common/agent-scope';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { paginationArgs } from '../common/dto/pagination-query.dto';
import { tenantScope } from '../common/org';
import { PrismaService } from '../prisma/prisma.service';
import { QueryTicketDto } from './dto';

/**
 * حالات التحقق الرسمية لبوابة الصعود — نفس المفردات في الخادم والواجهة.
 * الخادم هو مصدر السلطة دائمًا: الباركود مجرد مفتاح استرجاع.
 */
export type TicketValidationCode =
  | 'VALID'
  | 'ALREADY_BOARDED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'NOT_FOUND'
  | 'PAYMENT_PENDING'
  | 'WRONG_TRIP'
  | 'BOARDING_CLOSED';

const UNBOARDABLE_TRIP_STATUSES: TripStatus[] = [
  TripStatus.DEPARTED,
  TripStatus.COMPLETED,
  TripStatus.CANCELLED,
];

export interface TicketValidationResult {
  code: TicketValidationCode;
  message: string;
  boardable: boolean;
  ticket: TicketPayload | null;
}

export interface TicketPayload {
  id: string;
  number: string;
  boardingToken: string | null;
  passengerName: string;
  passengerPhone: string;
  passengerNationalId: string | null;
  seatLabel: string;
  boardingStop: string | null;
  dropOffStop: string | null;
  fare: string;
  status: TicketStatus;
  boardedAt: string | null;
  trip: {
    id: string;
    status: TripStatus;
    departureAt: Date;
    driverName: string | null;
    route: { name: string; fromCity: string; toCity: string };
    bus: { plateNumber: string; model: string | null } | null;
  };
  booking: {
    id: string;
    status: string;
    paymentStatus: string;
  };
}

type TicketRow = Prisma.TicketGetPayload<{
  include: {
    booking: { include: { payments: true } };
    trip: { include: { route: true; bus: true } };
  };
}>;

function toPayload(row: TicketRow): TicketPayload {
  const payments = row.booking.payments;
  const paid = payments.reduce(
    (sum, payment) => sum.plus(payment.amount).minus(payment.refundedAmount),
    new Prisma.Decimal(0),
  );
  return {
    id: row.id,
    number: row.number,
    boardingToken: row.boardingToken,
    passengerName: row.passengerName,
    passengerPhone: row.passengerPhone,
    passengerNationalId: row.passengerNationalId,
    seatLabel: row.seatLabel,
    boardingStop: row.boardingStop,
    dropOffStop: row.dropOffStop,
    fare: row.fare.toFixed(2),
    status: row.status,
    boardedAt: row.boardedAt ? row.boardedAt.toISOString() : null,
    trip: {
      id: row.trip.id,
      status: row.trip.status,
      departureAt: row.trip.departureAt,
      driverName: row.trip.driverName,
      route: {
        name: row.trip.route.name,
        fromCity: row.trip.route.fromCity,
        toCity: row.trip.route.toCity,
      },
      bus: row.trip.bus
        ? { plateNumber: row.trip.bus.plateNumber, model: row.trip.bus.model }
        : null,
    },
    booking: {
      id: row.booking.id,
      status: row.booking.status,
      paymentStatus: paid.gte(row.fare) ? 'PAID' : 'PENDING',
    },
  };
}

/** Test helper: exposes the numeric seat label surfaced on the ticket. */
export const toPayloadHelpers = {
  seatLabelOf: (row: { seatLabel: string }): string => row.seatLabel,
};

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(user: AuthUser, query: QueryTicketDto = {}) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    const where: Prisma.TicketWhereInput = {
      organizationId: scope.organizationId,
      ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
      ...(agentId ? { booking: { agentId } } : {}),
    };
    if (query.tripId) where.tripId = query.tripId;
    return this.prisma.ticket.findMany({
      where,
      include: {
        booking: { include: { payments: true } },
        trip: { include: { route: true, bus: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    });
  }

  async findOne(user: AuthUser, id: string) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
        ...(agentId ? { booking: { agentId } } : {}),
      },
      include: {
        booking: { include: { payments: true, customer: true } },
        trip: { include: { route: true, bus: true } },
      },
    });
    if (!ticket) throw new NotFoundException('التذكرة غير موجودة');
    return ticket;
  }

  async findByQr(user: AuthUser, qr: string) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    // بوابة الصعود: القيمة قد يكون توكِن الباركود (TB-…) أو رمز QR
    // (uuid) أو رقم التذكرة المطبوع (TK-… / TKT-…) — الكاشير يقرأ
    // الرقم من الورقة. نطابق أياً منها داخل نفس النطاق المعزول
    // (لا بحث عابر للمستأجرين).
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        OR: [{ qrCode: qr }, { number: qr }, { boardingToken: qr }],
        organizationId: scope.organizationId,
        ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
        ...(agentId ? { booking: { agentId } } : {}),
      },
      include: {
        booking: true,
        trip: { include: { route: true, bus: true } },
      },
    });
    if (!ticket) throw new NotFoundException('التذكرة غير موجودة');
    return ticket;
  }

  /**
   * مسار التحقق الرسمي للباركود/الرقم المطبوع.
   *
   * السلطة للخادم: نسترجع التذكرة الفعلية من قاعدة البيانات (توكِن
   * عاتِم — لا بيانات راكب في الباركود) ثم نقيّم كل شرط من شروط
   * الصعود ونُعيد حالة معيارية برسالة واضحة وdata كاملة عند النجاح.
   */
  async validate(user: AuthUser, code: string, tripId?: string) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    const value = code.trim();

    const ticket = await this.prisma.ticket.findFirst({
      where: {
        OR: [{ boardingToken: value }, { qrCode: value }, { number: value }],
        organizationId: scope.organizationId,
        ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
        ...(agentId ? { booking: { agentId } } : {}),
      },
      include: {
        booking: { include: { payments: true } },
        trip: { include: { route: true, bus: true } },
      },
    });

    if (!ticket) {
      await this.audit.log(user, 'TICKET_SCAN_NOT_FOUND', 'Ticket', undefined, {
        codePrefix: value.slice(0, 4),
      });
      return {
        code: 'NOT_FOUND' as const,
        message: 'لا توجد تذكرة بهذا الرمز في هذه الشركة',
        boardable: false,
        ticket: null,
      };
    }

    const payload = toPayload(ticket);

    if (ticket.status === TicketStatus.CANCELLED) {
      return {
        code: 'CANCELLED' as const,
        message: 'هذه التذكرة ملغاة — لا يمكن الصعود بها',
        boardable: false,
        ticket: payload,
      };
    }
    if (ticket.status === TicketStatus.REFUNDED) {
      return {
        code: 'REFUNDED' as const,
        message: 'هذه التذكرة مستردة — لا يمكن الصعود بها',
        boardable: false,
        ticket: payload,
      };
    }
    if (ticket.status === TicketStatus.CHECKED_IN) {
      return {
        code: 'ALREADY_BOARDED' as const,
        message: 'تم تسجيل صعود صاحب هذه التذكرة مسبقًا',
        boardable: false,
        ticket: payload,
      };
    }

    // الدفع: بوابة الصعود تمنع ركوب تذكرة غير مسددة كاملة.
    const paid = ticket.booking.payments.reduce(
      (sum, payment) => sum.plus(payment.amount).minus(payment.refundedAmount),
      new Prisma.Decimal(0),
    );
    if (paid.lt(ticket.fare)) {
      return {
        code: 'PAYMENT_PENDING' as const,
        message: 'الدفع غير مكتمل لهذه التذكرة — راجع الكاشير',
        boardable: false,
        ticket: payload,
      };
    }

    // الرحلة: ملغاة/غادرت/مكتملة — الصعود مغلق.
    if (UNBOARDABLE_TRIP_STATUSES.includes(ticket.trip.status)) {
      return {
        code: 'BOARDING_CLOSED' as const,
        message:
          ticket.trip.status === TripStatus.CANCELLED
            ? 'الرحلة ملغاة — لا يمكن تسجيل الصعود'
            : 'الرحلة غادرت بالفعل — لا يمكن تسجيل الصعود',
        boardable: false,
        ticket: payload,
      };
    }

    // بوابة محددة برحلة (اختياري): الباركود صالح لكن ليس لهذه الرحلة.
    if (tripId && ticket.tripId !== tripId) {
      return {
        code: 'WRONG_TRIP' as const,
        message: 'هذه التذكرة لرحلة أخرى — تحقق من رقم الرحلة',
        boardable: false,
        ticket: payload,
      };
    }

    await this.audit.log(user, 'TICKET_SCANNED', 'Ticket', ticket.id, {
      tripId: ticket.tripId,
      seat: ticket.seatLabel,
    });

    return {
      code: 'VALID' as const,
      message: 'تذكرة صالحة — جاهزة للصعود',
      boardable: true,
      ticket: payload,
    };
  }

  async checkIn(user: AuthUser, id: string) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
        ...(agentId ? { booking: { agentId } } : {}),
      },
      include: {
        booking: { include: { payments: true } },
        trip: { select: { status: true, departureAt: true } },
      },
    });
    if (!ticket) throw new NotFoundException('التذكرة غير موجودة');
    // بوابة الصعود مسؤولة عن عدّ الركاب الفعلي — لا يُسمح بصعود بعد
    // مغادرة الرحلة أو إلغائها أو اكتمالها (سلامة المنفستو والأشغال).
    const unboardable = ['DEPARTED', 'COMPLETED', 'CANCELLED'];
    if (unboardable.includes(ticket.trip.status)) {
      throw new ConflictException('لا يمكن تسجيل الصعود لهذه الرحلة الآن');
    }
    // الدفع غير المكتمل يمنع الصعود (نفس قاعدة التحقق أعلاه).
    const paid = ticket.booking.payments.reduce(
      (sum, payment) => sum.plus(payment.amount).minus(payment.refundedAmount),
      new Prisma.Decimal(0),
    );
    if (paid.lt(ticket.fare)) {
      throw new ConflictException(
        'الدفع غير مكتمل لهذه التذكرة — لا يمكن تسجيل الصعود',
      );
    }

    // كتابة شرطية ذرّية: التذكرة يجب أن تكون BOOKED في لحظة التحديث.
    // قراءة-ثم-كتابة تسمح بسباق تسجيل صعود متزامن مزدوج (تدقيق P1-1) —
    // الشرط في WHERE يجعل التحديث فاشلاً ذرّياً عند أي سباق.
    const claimed = await this.prisma.$transaction((tx) =>
      tx.ticket.updateMany({
        where: {
          id,
          status: 'BOOKED',
          ...(agentId ? { booking: { agentId } } : {}),
        },
        data: {
          status: 'CHECKED_IN',
          boardedAt: new Date(),
          boardedById: user.sub,
        },
      }),
    );
    if (claimed.count === 0) {
      throw new ConflictException('تم تسجيل صعود صاحب هذه التذكرة مسبقاً');
    }

    const updated = await this.prisma.ticket.findUniqueOrThrow({
      where: { id },
      // نفس شكل استجابة by-qr/findOne — الواجهة تعرض route الرحلة
      include: { booking: true, trip: { include: { route: true } } },
    });
    await this.audit.log(user, 'TICKET_CHECKED_IN', 'Ticket', id, {
      tripId: ticket.tripId,
      seat: ticket.seatLabel,
    });
    return updated;
  }

  /**
   * تسجيل طباعة التذكرة (تدقيق §24): من طبع ومتى — دون تكرار
   * الطابع الزمني عند إعادة الطباعة من نفس المستخدم.
   */
  async markPrinted(user: AuthUser, id: string) {
    const scope = tenantScope(user);
    const agentId = await resolveAgentId(this.prisma, user);
    const printedAt = new Date();
    const updated = await this.prisma.ticket.updateMany({
      where: {
        id,
        organizationId: scope.organizationId,
        ...(scope.branchId ? { trip: { branchId: scope.branchId } } : {}),
        ...(agentId ? { booking: { agentId } } : {}),
      },
      data: { printedAt, printedById: user.sub },
    });
    if (updated.count === 0) {
      throw new NotFoundException('التذكرة غير موجودة');
    }

    await this.audit.log(user, 'TICKET_PRINTED', 'Ticket', id, {});
    return { id, printedAt, printed: true as const };
  }
}
