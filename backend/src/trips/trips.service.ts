import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountingEventType,
  Prisma,
  SeatStatus,
  SeatType,
  TripStatus,
} from '@prisma/client';
import { enqueueAccountingEvent } from '../accounting/accounting-events';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { paginationArgs } from '../common/dto/pagination-query.dto';
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  idempotencyRequestHash,
  requireIdempotencyKey,
} from '../common/idempotency';
import { requireOrgId, tenantScope } from '../common/org';
import { lockTripTransaction } from '../common/transaction-locks';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto, QueryTripDto, UpdateTripDto } from './dto';

const BOOKABLE_STATUSES: TripStatus[] = [TripStatus.SCHEDULED, TripStatus.OPEN];
const BOOKABLE_SEAT_TYPES: SeatType[] = [SeatType.REGULAR, SeatType.VIP];

function initialSeatStatus(seatType: SeatType): SeatStatus {
  return BOOKABLE_SEAT_TYPES.includes(seatType)
    ? SeatStatus.AVAILABLE
    : SeatStatus.BLOCKED;
}

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateTripDto) {
    const orgId = requireOrgId(user);
    const { routeId, busId, driverId, departureAt, arrivalAt, price, ...rest } =
      dto;

    const [route, bus, driver] = await Promise.all([
      this.prisma.route.findFirst({
        where: { id: routeId, ...tenantScope(user) },
      }),
      this.prisma.bus.findFirst({
        where: { id: busId, ...tenantScope(user) },
        include: { seatTemplate: { include: { seats: true } } },
      }),
      driverId
        ? this.prisma.driver.findFirst({
            where: { id: driverId, ...tenantScope(user) },
          })
        : Promise.resolve(null),
    ]);

    if (!route) throw new NotFoundException('المسار غير موجود');
    if (!bus) throw new NotFoundException('الباص غير موجود');
    if (bus.status !== 'READY') {
      throw new ConflictException('لا يمكن إنشاء رحلة على باص غير جاهز');
    }
    if (driverId && !driver) throw new NotFoundException('السائق غير موجود');
    if (
      driver &&
      (driver.status !== 'ACTIVE' || driver.licenseExpiry <= new Date())
    ) {
      throw new ConflictException('لا يمكن تعيين سائق غير نشط أو منتهي الرخصة');
    }

    return this.prisma.trip.create({
      data: {
        organizationId: orgId,
        routeId,
        busId,
        driverId: driver?.id,
        branchId: user.branchId ?? route.branchId ?? bus.branchId,
        departureAt: new Date(departureAt),
        arrivalAt: arrivalAt ? new Date(arrivalAt) : undefined,
        status: rest.status ?? TripStatus.OPEN,
        driverName: driver?.name ?? rest.driverName,
        driverPhone: driver?.phone ?? rest.driverPhone,
        tripSeats: {
          create: bus.seatTemplate.seats.map((seat) => ({
            row: seat.row,
            column: seat.column,
            label: seat.label,
            seatType: seat.seatType,
            status: initialSeatStatus(seat.seatType),
            price: new Prisma.Decimal(price),
          })),
        },
      },
      include: {
        route: true,
        bus: { include: { seatTemplate: true } },
        driver: true,
        tripSeats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
      },
    });
  }

  findAll(user: AuthUser, query: QueryTripDto) {
    const { date, routeId, status } = query;
    const where: Prisma.TripWhereInput = { ...tenantScope(user) };
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.departureAt = { gte: start, lt: end };
    }
    if (routeId) where.routeId = routeId;
    if (status) where.status = status;

    return this.prisma.trip.findMany({
      where,
      include: {
        route: true,
        bus: { include: { seatTemplate: true } },
        driver: true,
        _count: { select: { tripSeats: true, tickets: true } },
      },
      orderBy: [{ departureAt: 'asc' }, { id: 'asc' }],
      ...paginationArgs(query),
    });
  }

  async findOne(user: AuthUser, id: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, ...tenantScope(user) },
      include: {
        route: true,
        bus: { include: { seatTemplate: true } },
        driver: true,
        tripSeats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
      },
    });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة');
    return trip;
  }

  async seats(user: AuthUser, id: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, ...tenantScope(user) },
      include: {
        route: { include: { stops: { orderBy: { order: 'asc' } } } },
        bus: { include: { seatTemplate: { include: { seats: true } } } },
        driver: true,
        tripSeats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
      },
    });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة');

    // إصلاح الرحلات القديمة التي أُنشئت قبل اعتماد نسخة كاملة من قالب المقاعد.
    // عمليات إنشاء الرحلات الجديدة تنسخ القالب كاملًا داخل create().
    const existingLabels = new Set(trip.tripSeats.map((seat) => seat.label));
    const missingTemplateSeats = trip.bus.seatTemplate.seats.filter(
      (seat) => !existingLabels.has(seat.label),
    );
    const fallbackPrice = trip.tripSeats[0]?.price;
    if (missingTemplateSeats.length > 0 && fallbackPrice) {
      await this.prisma.tripSeat.createMany({
        data: missingTemplateSeats.map((seat) => ({
          tripId: trip.id,
          row: seat.row,
          column: seat.column,
          label: seat.label,
          seatType: seat.seatType,
          status: initialSeatStatus(seat.seatType),
          price: fallbackPrice,
        })),
        skipDuplicates: true,
      });
    }

    // تحرير المقاعد المقفلة مؤقتاً التي انتهت صلاحيتها (تنظيف كسول)
    await this.prisma.tripSeat.updateMany({
      where: {
        tripId: id,
        status: 'HELD',
        holdExpiresAt: { lt: new Date() },
      },
      data: { status: 'AVAILABLE', heldByUserId: null, holdExpiresAt: null },
    });

    const seats = await this.prisma.tripSeat.findMany({
      where: { tripId: id },
      orderBy: [{ row: 'asc' }, { column: 'asc' }],
    });

    const { seatTemplate, ...bus } = trip.bus;
    return {
      trip: {
        id: trip.id,
        routeId: trip.routeId,
        busId: trip.busId,
        departureAt: trip.departureAt,
        arrivalAt: trip.arrivalAt,
        status: trip.status,
        driverName: trip.driverName,
        driverPhone: trip.driverPhone,
        route: trip.route,
        bus,
        bookable: BOOKABLE_STATUSES.includes(trip.status),
      },
      layout: {
        rows: seatTemplate.rows,
        columnsPerRow: seatTemplate.columnsPerRow,
        aisleAfterColumn: seatTemplate.aisleAfterColumn,
      },
      seats,
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateTripDto) {
    if (dto.status === TripStatus.CANCELLED) {
      throw new BadRequestException(
        'استخدم مسار إلغاء الرحلة لضمان معالجة الحجوزات والمبالغ',
      );
    }
    await this.ensureExists(user, id);
    const { price, driverId, ...data } = dto;
    const driver = driverId
      ? await this.prisma.driver.findFirst({
          where: { id: driverId, ...tenantScope(user) },
        })
      : null;
    if (driverId && !driver) throw new NotFoundException('السائق غير موجود');
    if (
      driver &&
      (driver.status !== 'ACTIVE' || driver.licenseExpiry <= new Date())
    ) {
      throw new ConflictException('لا يمكن تعيين سائق غير نشط أو منتهي الرخصة');
    }

    return this.prisma.$transaction(async (tx) => {
      if (price !== undefined) {
        // تحديث سعر المقاعد المتاحة فقط (غير المحجوزة/المقفلة مؤقتاً)
        await tx.tripSeat.updateMany({
          where: { tripId: id, status: 'AVAILABLE' },
          data: { price: new Prisma.Decimal(price) },
        });
      }
      return tx.trip.update({
        where: { id },
        data: {
          ...data,
          driverId,
          driverName: driver?.name ?? data.driverName,
          driverPhone: driver?.phone ?? data.driverPhone,
          departureAt: data.departureAt
            ? new Date(data.departureAt)
            : undefined,
          arrivalAt: data.arrivalAt ? new Date(data.arrivalAt) : undefined,
        },
        include: {
          route: true,
          bus: { include: { seatTemplate: true } },
          driver: true,
          tripSeats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
        },
      });
    });
  }

  async cancel(
    user: AuthUser,
    id: string,
    reason: string,
    idempotencyKey?: string,
  ) {
    const orgId = requireOrgId(user);
    const key = requireIdempotencyKey(idempotencyKey);
    const requestHash = idempotencyRequestHash({ tripId: id, reason });

    const result = await this.prisma.$transaction(async (tx) => {
      await lockTripTransaction(tx, orgId, id);
      const operation = await beginIdempotentOperation(
        tx,
        orgId,
        'trips.cancel',
        key,
        requestHash,
      );
      if (operation.replay) {
        const replayedTrip = await tx.trip.findFirst({
          where: { id, ...tenantScope(user) },
          include: { route: true, bus: true },
        });
        if (!replayedTrip) {
          throw new ConflictException('تعذر استعادة نتيجة العملية السابقة');
        }
        return {
          trip: replayedTrip,
          affectedBookings: 0,
          refundsCount: 0,
          replayed: true,
        };
      }

      const trip = await tx.trip.findFirst({
        where: { id, ...tenantScope(user) },
        include: {
          bookings: {
            where: { status: { in: ['PENDING', 'CONFIRMED'] } },
            include: { payments: true },
          },
        },
      });
      if (!trip) throw new NotFoundException('الرحلة غير موجودة');
      if (trip.status === TripStatus.CANCELLED) {
        throw new ConflictException('الرحلة ملغاة بالفعل');
      }
      if (trip.status === TripStatus.COMPLETED) {
        throw new ConflictException('لا يمكن إلغاء رحلة مكتملة');
      }

      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { cancellationFeePercent: true },
      });
      const refundRatio = new Prisma.Decimal(100)
        .minus(organization.cancellationFeePercent)
        .div(100);
      let refundsCount = 0;

      for (const booking of trip.bookings) {
        let bookingRefund = new Prisma.Decimal(0);
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
            bookingRefund = bookingRefund.plus(refundAmount);
            refundsCount += 1;
          }
          // PostgreSQL trigger atomically updates the payment refund total
          // and rejects cumulative over-refunds under concurrent writers.
        }

        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: bookingRefund.gt(0) ? 'REFUNDED' : 'CANCELLED',
            cancellationReason: reason,
            cancelledAt: new Date(),
            cancelledById: user.sub,
          },
        });
        await tx.ticket.updateMany({
          where: { bookingId: booking.id },
          data: { status: bookingRefund.gt(0) ? 'REFUNDED' : 'CANCELLED' },
        });
        await tx.commission.updateMany({
          where: { bookingId: booking.id, reversedAt: null },
          data: { reversedAt: new Date(), reversalReason: reason },
        });
      }

      await tx.tripSeat.updateMany({
        where: { tripId: id },
        data: {
          status: 'BLOCKED',
          heldByUserId: null,
          holdExpiresAt: null,
        },
      });
      const cancelledTrip = await tx.trip.update({
        where: { id },
        data: { status: TripStatus.CANCELLED },
        include: { route: true, bus: true },
      });
      await completeIdempotentOperation(
        tx,
        operation.record.id,
        'Trip',
        cancelledTrip.id,
      );
      return {
        trip: cancelledTrip,
        affectedBookings: trip.bookings.length,
        refundsCount,
        replayed: false,
      };
    });

    if (!result.replayed)
      await this.audit.log(user, 'TRIP_CANCELLED', 'Trip', id, {
        reason,
        affectedBookings: result.affectedBookings,
        refundsCount: result.refundsCount,
      });
    return result;
  }

  async remove(user: AuthUser, id: string) {
    await this.ensureExists(user, id);
    try {
      return await this.prisma.trip.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2003' || error.code === 'P2014')
      ) {
        throw new ConflictException(
          'لا يمكن حذف رحلة مرتبطة بحجوزات. ألغِ الرحلة بدلاً من ذلك.',
        );
      }
      throw error;
    }
  }

  private async ensureExists(user: AuthUser, id: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, ...tenantScope(user) },
    });
    if (!trip) throw new NotFoundException('الرحلة غير موجودة');
    return trip;
  }
}
