import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingEventType,
  CommissionType,
  Prisma,
  SeatType,
  TripStatus,
} from '@prisma/client';
import { enqueueAccountingEvent } from '../accounting/accounting-events';
import { resolveAgentId } from '../common/agent-scope';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { paginationArgs } from '../common/dto/pagination-query.dto';
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  idempotencyRequestHash,
  requireIdempotencyKey,
} from '../common/idempotency';
import { tenantScope } from '../common/org';
import { lockTripTransaction } from '../common/transaction-locks';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto, HoldSeatDto, QueryBookingDto } from './dto';

const BOOKABLE_STATUSES: TripStatus[] = [TripStatus.SCHEDULED, TripStatus.OPEN];
const BOOKABLE_SEAT_TYPES: SeatType[] = [SeatType.REGULAR, SeatType.VIP];
const HOLD_MINUTES = 10;

function ticketNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${ts}-${rand}`;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async hold(user: AuthUser, dto: HoldSeatDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: dto.tripId, ...tenantScope(user) },
    });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة');
    if (!BOOKABLE_STATUSES.includes(trip.status)) {
      throw new ConflictException('الرحلة غير مفتوحة للحجز');
    }

    const now = new Date();
    const result = await this.prisma.tripSeat.updateMany({
      where: {
        id: dto.seatId,
        tripId: dto.tripId,
        seatType: { in: BOOKABLE_SEAT_TYPES },
        OR: [
          { status: 'AVAILABLE' },
          {
            status: 'HELD',
            heldByUserId: user.sub,
            holdExpiresAt: { gte: now },
          },
        ],
      },
      data: {
        status: 'HELD',
        heldByUserId: user.sub,
        holdExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
      },
    });
    if (result.count === 0) {
      throw new ConflictException('المقعد غير متاح');
    }

    await this.audit.log(user, 'SEAT_HELD', 'TripSeat', dto.seatId, {
      tripId: dto.tripId,
    });
    return {
      held: true,
      seatId: dto.seatId,
      expiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
    };
  }

  async release(user: AuthUser, seatId: string) {
    const result = await this.prisma.tripSeat.updateMany({
      where: { id: seatId, status: 'HELD', heldByUserId: user.sub },
      data: { status: 'AVAILABLE', heldByUserId: null, holdExpiresAt: null },
    });
    return { released: result.count > 0 };
  }

  async createBooking(
    user: AuthUser,
    dto: CreateBookingDto,
    idempotencyKey?: string,
  ) {
    const orgId = this.org(user);
    const passengerBySeat = new Map(
      dto.passengers?.map((passenger) => [passenger.seatId, passenger]) ?? [],
    );
    if (dto.passengers?.length) {
      if (
        dto.passengers.length !== dto.seatIds.length ||
        dto.seatIds.some((seatId) => !passengerBySeat.has(seatId))
      ) {
        throw new BadRequestException(
          'يجب إدخال بيانات مسافر كاملة لكل مقعد محدد',
        );
      }
    } else if (!dto.passengerName || !dto.passengerPhone) {
      throw new BadRequestException('بيانات المسافر مطلوبة');
    }
    if (
      !idempotencyKey ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 128
    ) {
      throw new BadRequestException(
        'يلزم إرسال Idempotency-Key صالح لإتمام الحجز',
      );
    }
    const replayAgentId = await resolveAgentId(this.prisma, user);
    const replay = await this.prisma.booking.findFirst({
      where: {
        idempotencyKey,
        ...tenantScope(user),
        ...(replayAgentId ? { agentId: replayAgentId } : {}),
      },
      include: {
        tickets: true,
        payments: true,
        customer: true,
        trip: { include: { route: true } },
      },
    });
    if (replay) return replay;

    return this.prisma.$transaction(async (tx) => {
      await lockTripTransaction(tx, orgId, dto.tripId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:${idempotencyKey}`}))`;
      const principalAgentId = await resolveAgentId(tx, user);
      const concurrentReplay = await tx.booking.findFirst({
        where: {
          idempotencyKey,
          ...tenantScope(user),
          ...(principalAgentId ? { agentId: principalAgentId } : {}),
        },
        include: {
          tickets: true,
          payments: true,
          customer: true,
          trip: { include: { route: true } },
        },
      });
      if (concurrentReplay) return concurrentReplay;

      const trip = await tx.trip.findFirst({
        where: { id: dto.tripId, ...tenantScope(user) },
      });
      if (!trip) throw new NotFoundException('الرحلة غير موجودة');
      if (!BOOKABLE_STATUSES.includes(trip.status)) {
        throw new ConflictException('الرحلة غير مفتوحة للحجز');
      }

      if (dto.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: dto.customerId, ...tenantScope(user) },
        });
        if (!customer) throw new NotFoundException('العميل غير موجود');
      }

      if (principalAgentId && dto.agentId && dto.agentId !== principalAgentId) {
        throw new NotFoundException('الوكيل غير موجود');
      }
      const effectiveAgentId = principalAgentId ?? dto.agentId;
      let agent: {
        id: string;
        commissionType: CommissionType;
        commissionValue: Prisma.Decimal;
      } | null = null;
      if (effectiveAgentId) {
        agent = await tx.agent.findFirst({
          where: { id: effectiveAgentId, ...tenantScope(user), active: true },
        });
        if (!agent) throw new NotFoundException('الوكيل غير موجود');
      }

      const seats = await tx.tripSeat.findMany({
        where: { id: { in: dto.seatIds }, tripId: dto.tripId },
      });
      if (seats.length !== dto.seatIds.length) {
        throw new NotFoundException('أحد المقاعد المحددة غير موجود');
      }
      const invalidSeat = seats.find(
        (seat) => !BOOKABLE_SEAT_TYPES.includes(seat.seatType),
      );
      if (invalidSeat) {
        throw new ConflictException(
          `المقعد ${invalidSeat.label} غير قابل للبيع`,
        );
      }

      const now = new Date();
      let total = new Prisma.Decimal(0);
      const claimed: typeof seats = [];
      for (const seat of seats) {
        const result = await tx.tripSeat.updateMany({
          where: {
            id: seat.id,
            seatType: { in: BOOKABLE_SEAT_TYPES },
            OR: [
              { status: 'AVAILABLE' },
              {
                status: 'HELD',
                heldByUserId: user.sub,
                holdExpiresAt: { gte: now },
              },
            ],
          },
          data: { status: 'BOOKED', heldByUserId: null, holdExpiresAt: null },
        });
        if (result.count === 0) {
          throw new ConflictException(`المقعد ${seat.label} غير متاح`);
        }
        total = total.plus(seat.price);
        claimed.push(seat);
      }

      const booking = await tx.booking.create({
        data: {
          organizationId: orgId,
          branchId: user.branchId ?? trip.branchId,
          tripId: dto.tripId,
          idempotencyKey,
          customerId: dto.customerId ?? null,
          agentId: effectiveAgentId ?? null,
          createdById: user.sub,
          totalAmount: total,
          status: 'CONFIRMED',
          notes: dto.notes,
          tickets: {
            create: claimed.map((seat) => {
              const passenger = passengerBySeat.get(seat.id);
              return {
                organizationId: orgId,
                tripId: dto.tripId,
                tripSeatId: seat.id,
                number: ticketNumber(),
                passengerName: passenger?.passengerName ?? dto.passengerName!,
                passengerPhone:
                  passenger?.passengerPhone ?? dto.passengerPhone!,
                passengerNationalId:
                  passenger?.passengerNationalId ?? dto.passengerNationalId,
                seatLabel: seat.label,
                boardingStop: dto.boardingStop,
                dropOffStop: dto.dropOffStop,
                fare: seat.price,
                qrCode: randomUUID(),
              };
            }),
          },
          payments: {
            create: {
              organizationId: orgId,
              branchId: user.branchId ?? trip.branchId,
              idempotencyKey,
              amount: total,
              method: dto.paymentMethod,
              reference: dto.paymentReference,
              receivedById: user.sub,
            },
          },
        },
        include: {
          tickets: true,
          payments: true,
          customer: true,
          trip: { include: { route: true } },
        },
      });

      for (const ticket of booking.tickets) {
        await tx.tripSeat.update({
          where: { id: ticket.tripSeatId },
          data: { ticketId: ticket.id },
        });
      }
      for (const payment of booking.payments) {
        await enqueueAccountingEvent(
          tx,
          orgId,
          AccountingEventType.PAYMENT_RECEIVED,
          payment.id,
        );
      }

      if (agent) {
        for (const ticket of booking.tickets) {
          const amount =
            agent.commissionType === CommissionType.PERCENT
              ? ticket.fare.mul(agent.commissionValue).div(100)
              : agent.commissionValue;
          await tx.commission.create({
            data: {
              organizationId: orgId,
              agentId: agent.id,
              bookingId: booking.id,
              ticketId: ticket.id,
              amount,
            },
          });
        }
      }

      const available = await tx.tripSeat.count({
        where: {
          tripId: dto.tripId,
          status: 'AVAILABLE',
          seatType: { in: BOOKABLE_SEAT_TYPES },
        },
      });
      if (available === 0) {
        await tx.trip.update({
          where: { id: dto.tripId },
          data: { status: 'FULL' },
        });
      }

      await this.audit.log(user, 'BOOKING_CREATED', 'Booking', booking.id, {
        tripId: dto.tripId,
        seats: claimed.length,
        amount: total.toFixed(2),
      });
      return booking;
    });
  }

  async findAll(user: AuthUser, query: QueryBookingDto) {
    const agentId = await resolveAgentId(this.prisma, user);
    const where: Prisma.BookingWhereInput = {
      ...tenantScope(user),
      ...(agentId ? { agentId } : {}),
    };
    if (query.tripId) where.tripId = query.tripId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.tickets = {
        some: {
          OR: [
            { passengerName: { contains: query.search, mode: 'insensitive' } },
            { passengerPhone: { contains: query.search } },
            { number: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      };
    }
    if (query.date) {
      const start = new Date(`${query.date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.trip = { departureAt: { gte: start, lt: end } };
    }
    return this.prisma.booking.findMany({
      where,
      include: {
        tickets: true,
        payments: true,
        customer: true,
        trip: { include: { route: true, bus: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...paginationArgs(query),
    });
  }

  async findOne(user: AuthUser, id: string) {
    const agentId = await resolveAgentId(this.prisma, user);
    const booking = await this.prisma.booking.findFirst({
      where: { id, ...tenantScope(user), ...(agentId ? { agentId } : {}) },
      include: {
        tickets: true,
        payments: true,
        customer: true,
        trip: { include: { route: true, bus: true } },
      },
    });
    if (!booking) throw new NotFoundException('الحجز غير موجود');
    return booking;
  }

  async cancel(
    user: AuthUser,
    id: string,
    reason: string,
    idempotencyKey?: string,
  ) {
    const orgId = this.org(user);
    const key = requireIdempotencyKey(idempotencyKey);
    const requestHash = idempotencyRequestHash({ bookingId: id, reason });

    const result = await this.prisma.$transaction(async (tx) => {
      const agentId = await resolveAgentId(tx, user);
      const bookingIdentity = await tx.booking.findFirst({
        where: { id, ...tenantScope(user), ...(agentId ? { agentId } : {}) },
        select: { tripId: true },
      });
      if (!bookingIdentity) throw new NotFoundException('الحجز غير موجود');
      await lockTripTransaction(tx, orgId, bookingIdentity.tripId);
      const operation = await beginIdempotentOperation(
        tx,
        orgId,
        'bookings.cancel',
        key,
        requestHash,
      );
      if (operation.replay) {
        const replayedBooking = await tx.booking.findFirst({
          where: {
            id: operation.record.resourceId ?? id,
            ...tenantScope(user),
          },
          include: { tickets: true, payments: true, refunds: true },
        });
        if (!replayedBooking) {
          throw new ConflictException('تعذر استعادة نتيجة العملية السابقة');
        }
        return {
          booking: replayedBooking,
          refundedAmount: new Prisma.Decimal(0),
          replayed: true,
        };
      }

      const booking = await tx.booking.findFirst({
        where: { id, ...tenantScope(user) },
        include: { tickets: true, payments: true, trip: true },
      });
      if (!booking) throw new NotFoundException('الحجز غير موجود');
      if (booking.status !== 'CONFIRMED') {
        throw new ConflictException('لا يمكن إلغاء حجز غير مؤكد');
      }
      if (
        booking.trip.status === 'DEPARTED' ||
        booking.trip.status === 'COMPLETED'
      ) {
        throw new ConflictException('لا يمكن إلغاء الحجز بعد مغادرة الرحلة');
      }

      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { cancellationFeePercent: true },
      });
      const refundRatio = new Prisma.Decimal(100)
        .minus(organization.cancellationFeePercent)
        .div(100);
      let refundedTotal = new Prisma.Decimal(0);

      for (const payment of booking.payments) {
        const refundable = payment.amount.minus(payment.refundedAmount);
        if (refundable.lte(0)) continue;
        const refundAmount = refundable.mul(refundRatio).toDecimalPlaces(2);
        if (refundAmount.gt(0)) {
          const refund = await tx.refund.create({
            data: {
              organizationId: orgId,
              bookingId: booking.id,
              paymentId: payment.id,
              amount: refundAmount,
              reason,
              processedById: user.sub,
            },
          });
          await enqueueAccountingEvent(
            tx,
            orgId,
            AccountingEventType.REFUND_COMPLETED,
            refund.id,
          );
          refundedTotal = refundedTotal.plus(refundAmount);
        }
        // PostgreSQL trigger atomically increments refundedAmount while holding
        // the payment row lock and rejects cumulative over-refunds.
      }

      for (const ticket of booking.tickets) {
        await tx.tripSeat.update({
          where: { id: ticket.tripSeatId },
          data: { status: 'AVAILABLE', ticketId: null },
        });
      }
      await tx.ticket.updateMany({
        where: { bookingId: id },
        data: { status: refundedTotal.gt(0) ? 'REFUNDED' : 'CANCELLED' },
      });
      await tx.commission.updateMany({
        where: { bookingId: id, reversedAt: null },
        data: { reversedAt: new Date(), reversalReason: reason },
      });

      const updated = await tx.booking.update({
        where: { id },
        data: {
          status: refundedTotal.gt(0) ? 'REFUNDED' : 'CANCELLED',
          cancellationReason: reason,
          cancelledAt: new Date(),
          cancelledById: user.sub,
        },
        include: { tickets: true, payments: true, refunds: true },
      });

      if (booking.trip.status === 'FULL') {
        await tx.trip.update({
          where: { id: booking.tripId },
          data: { status: 'OPEN' },
        });
      }
      await completeIdempotentOperation(
        tx,
        operation.record.id,
        'Booking',
        updated.id,
      );
      return {
        booking: updated,
        refundedAmount: refundedTotal,
        replayed: false,
      };
    });

    if (!result.replayed)
      await this.audit.log(
        user,
        'BOOKING_CANCELLED_AND_REFUNDED',
        'Booking',
        id,
        {
          reason,
          refundedAmount: result.refundedAmount.toFixed(2),
        },
      );
    return result.booking;
  }

  private org(user: AuthUser): string {
    if (!user.orgId) {
      throw new ConflictException('لا توجد مؤسسة مرتبطة بهذا المستخدم');
    }
    return user.orgId;
  }
}
