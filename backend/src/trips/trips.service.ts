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

/** ترقيم المقاعد الرسمي: أرقام فقط (مشترك مع fleet لتفادي دورة استيراد). */
function isNumericSeatLabel(label: string): boolean {
  return /^\d{1,3}$/.test(label);
}
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

    const initialStatus = dto.status ?? TripStatus.OPEN;
    if (![TripStatus.SCHEDULED, TripStatus.OPEN].includes(initialStatus)) {
      throw new BadRequestException(
        'الحالة الابتدائية المسموحة للرحلة هي مجدولة أو مفتوحة فقط',
      );
    }

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

    // Scheduling overlap guard (DB enforces it via exclusion constraints; this
    // app-side check produces a friendly Arabic error and runs inside the same
    // request so the user never sees a raw constraint violation).
    const newDeparture = new Date(departureAt);
    const newArrival = arrivalAt ? new Date(arrivalAt) : null;
    const activeStatuses = [
      TripStatus.SCHEDULED,
      TripStatus.OPEN,
      TripStatus.FULL,
      TripStatus.DEPARTED,
    ];

    const formatTime = (d: Date) =>
      d.toLocaleString('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      });

    const overlappingBusTrip = await this.prisma.trip.findFirst({
      where: {
        organizationId: orgId,
        busId,
        status: { in: activeStatuses },
        ...(newArrival
          ? {
              OR: [
                {
                  departureAt: { lt: newArrival },
                  arrivalAt: { gt: newDeparture },
                },
                {
                  departureAt: { gte: newDeparture, lt: newArrival },
                  arrivalAt: null,
                },
              ],
            }
          : {
              OR: [
                { departureAt: { gte: newDeparture } },
                {
                  departureAt: { lt: newDeparture },
                  OR: [
                    { arrivalAt: null },
                    { arrivalAt: { gt: newDeparture } },
                  ],
                },
              ],
            }),
      },
      select: { departureAt: true, arrivalAt: true },
    });
    if (overlappingBusTrip) {
      throw new ConflictException(
        `الحافلة مشغولة برحلة أخرى في هذه الفترة (${formatTime(
          overlappingBusTrip.departureAt,
        )}${overlappingBusTrip.arrivalAt ? ` → ${formatTime(overlappingBusTrip.arrivalAt)}` : ''})`,
      );
    }

    if (driver) {
      const overlappingDriverTrip = await this.prisma.trip.findFirst({
        where: {
          organizationId: orgId,
          driverId: driver.id,
          status: { in: activeStatuses },
          ...(newArrival
            ? {
                OR: [
                  {
                    departureAt: { lt: newArrival },
                    arrivalAt: { gt: newDeparture },
                  },
                  {
                    departureAt: { gte: newDeparture, lt: newArrival },
                    arrivalAt: null,
                  },
                ],
              }
            : {
                OR: [
                  { departureAt: { gte: newDeparture } },
                  {
                    departureAt: { lt: newDeparture },
                    OR: [
                      { arrivalAt: null },
                      { arrivalAt: { gt: newDeparture } },
                    ],
                  },
                ],
              }),
        },
        select: { departureAt: true, arrivalAt: true },
      });
      if (overlappingDriverTrip) {
        throw new ConflictException(
          `السائق مشغول برحلة أخرى في هذه الفترة (${formatTime(
            overlappingDriverTrip.departureAt,
          )}${overlappingDriverTrip.arrivalAt ? ` → ${formatTime(overlappingDriverTrip.arrivalAt)}` : ''})`,
        );
      }
    }

    try {
      return this.prisma.trip.create({
        data: {
          organizationId: orgId,
          routeId,
          busId,
          driverId: driver?.id,
          branchId: user.branchId ?? route.branchId ?? bus.branchId,
          departureAt: new Date(departureAt),
          arrivalAt: arrivalAt ? new Date(arrivalAt) : undefined,
          status: initialStatus,
          driverName: driver?.name ?? rest.driverName,
          driverPhone: driver?.phone ?? rest.driverPhone,
          tripSeats: {
            // نسخة كاملة من قالب الحافلة بأرقام مقاعد رسمية (أرقام فقط) —
            // الترقيم الرقمي مشتق من الموضع وليس من حرف العمود.
            create: bus.seatTemplate.seats.map((seat) => ({
              row: seat.row,
              column: seat.column,
              label: isNumericSeatLabel(seat.label)
                ? seat.label
                : String(
                    (seat.row - 1) * bus.seatTemplate.columnsPerRow + seat.column,
                  ),
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('23P01') ||
        message.includes('trips_bus_schedule_no_overlap_excl') ||
        message.includes('trips_driver_schedule_no_overlap_excl')
      ) {
        throw new ConflictException('يوجد تعارض زمني في جدولة الحافلة أو السائق');
      }
      throw error;
    }
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
    const template = trip.bus.seatTemplate;
    const expectedLabel = (row: number, column: number) =>
      String((row - 1) * template.columnsPerRow + column);
    const existingPositions = new Set(
      trip.tripSeats.map((seat) => `${seat.row}-${seat.column}`),
    );
    const missingTemplateSeats = template.seats.filter(
      (seat) => !existingPositions.has(`${seat.row}-${seat.column}`),
    );
    const fallbackPrice = trip.tripSeats[0]?.price;
    if (missingTemplateSeats.length > 0 && fallbackPrice) {
      await this.prisma.tripSeat.createMany({
        data: missingTemplateSeats.map((seat) => ({
          tripId: trip.id,
          row: seat.row,
          column: seat.column,
          label: expectedLabel(seat.row, seat.column),
          seatType: seat.seatType,
          status: initialSeatStatus(seat.seatType),
          price: fallbackPrice,
        })),
        skipDuplicates: true,
      });
    }

    // الترقيم الرسمي: أرقام فقط. الرحلات التي أُنشئت قبل هذا الترقيم قد
    // تحمل حروفًا (A1) — نعيد اشتقاق الرقم من الموضع داخل الحافلة،
    // لكن نحافظ على المقاعد المحجوزة (الحجز مرتبط بـ id وليس بـ label).
    // المقاعد المبنية حديثًا (أعلاه) تُنشأ بالترقيم الرقمي مباشرة.
    const legacySeats = trip.tripSeats.filter(
      (seat) => !isNumericSeatLabel(seat.label),
    );
    if (legacySeats.length > 0) {
      // معاملة تفاعلية واحدة (نموذج الدالة) — وكيل RLS لا يدعم نموذج
      // المصفوفة داخل سياق الطلب، وكل التحديثات يجب أن تكون ذرّية.
      await this.prisma.$transaction(async (tx) => {
        for (const seat of legacySeats) {
          await tx.tripSeat.update({
            where: { id: seat.id },
            data: {
              label: expectedLabel(seat.row, seat.column),
            },
          });
        }
        // الرقم المطبوع على التذاكر القديمة يبقى مطابقًا للمقعد نفسه:
        // تحديث تسمية التذكرة لتتبع الرقم الجديد (نفس tripSeatId).
        const affectedTicketSeats = legacySeats.map((seat) => seat.id);
        const tickets = await tx.ticket.findMany({
          where: { tripSeatId: { in: affectedTicketSeats } },
          select: { id: true, tripSeatId: true },
        });
        for (const ticket of tickets) {
          const seat = legacySeats.find((s) => s.id === ticket.tripSeatId);
          if (seat) {
            await tx.ticket.update({
              where: { id: ticket.id },
              data: { seatLabel: expectedLabel(seat.row, seat.column) },
            });
          }
        }
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

    const soldCount = seats.filter((seat) => seat.status === 'BOOKED').length;
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
        bus: { ...bus, totalSeats: template.seats.length },
        bookable: BOOKABLE_STATUSES.includes(trip.status),
      },
      layout: {
        rows: seatTemplate.rows,
        columnsPerRow: seatTemplate.columnsPerRow,
        aisleAfterColumn: seatTemplate.aisleAfterColumn,
        // معلومات فيزيائية الحافلة للواجهة: أين السائق، أين الأبواب،
        // وأين الممر — مشتقة من التكوين، وتتغير تلقائيًا مع كل قالب.
        driverPosition: 'FRONT_LEFT',
        entranceDoor: 'FRONT_RIGHT',
        rearDoor: 'LEFT',
      },
      summary: {
        total: seats.length,
        sold: soldCount,
        available: seats.filter(
          (seat) =>
            seat.status === 'AVAILABLE' &&
            BOOKABLE_SEAT_TYPES.includes(seat.seatType),
        ).length,
      },
      seats,
    };
  }

  async update(user: AuthUser, id: string, dto: UpdateTripDto) {
    const organizationId = requireOrgId(user);
    const { price, driverId, status: requestedStatus, ...data } = dto;

    return this.prisma.$transaction(async (tx) => {
      await lockTripTransaction(tx, organizationId, id);

      const existing = await tx.trip.findFirst({
        where: { id, ...tenantScope(user) },
      });
      if (!existing) throw new NotFoundException('الرحلة غير موجودة');

      if (requestedStatus !== undefined && requestedStatus !== existing.status) {
        throw new ConflictException(
          'تغيير حالة الرحلة يجب أن يتم عبر إجراء الحالة المخصص',
        );
      }
      if (
        existing.status === TripStatus.DEPARTED ||
        existing.status === TripStatus.COMPLETED ||
        existing.status === TripStatus.CANCELLED
      ) {
        throw new ConflictException(
          'لا يمكن تعديل رحلة غادرت أو اكتملت أو أُلغيت',
        );
      }

      const driver = driverId
        ? await tx.driver.findFirst({
            where: { id: driverId, ...tenantScope(user) },
          })
        : null;
      if (driverId && !driver) {
        throw new NotFoundException('السائق غير موجود');
      }
      if (
        driver &&
        (driver.status !== 'ACTIVE' || driver.licenseExpiry <= new Date())
      ) {
        throw new ConflictException(
          'لا يمكن تعيين سائق غير نشط أو منتهي الرخصة',
        );
      }

      const departureAt = data.departureAt
        ? new Date(data.departureAt)
        : existing.departureAt;
      const arrivalAt =
        data.arrivalAt !== undefined
          ? data.arrivalAt
            ? new Date(data.arrivalAt)
            : null
          : existing.arrivalAt;

      if (arrivalAt && arrivalAt <= departureAt) {
        throw new BadRequestException(
          'موعد الوصول يجب أن يكون بعد موعد الانطلاق',
        );
      }

      const activeStatuses = [
        TripStatus.SCHEDULED,
        TripStatus.OPEN,
        TripStatus.FULL,
        TripStatus.DEPARTED,
      ];
      const scheduleChanged =
        data.departureAt !== undefined || data.arrivalAt !== undefined;

      if (scheduleChanged) {
        const overlappingBusTrip = arrivalAt
          ? await tx.trip.findFirst({
              where: {
                organizationId,
                id: { not: id },
                busId: existing.busId,
                status: { in: activeStatuses },
                OR: [
                  {
                    departureAt: { lt: arrivalAt },
                    arrivalAt: { gt: departureAt },
                  },
                  {
                    departureAt: { gte: departureAt, lt: arrivalAt },
                    arrivalAt: null,
                  },
                ],
              },
              select: { departureAt: true, arrivalAt: true },
            })
          : await tx.trip.findFirst({
              where: {
                organizationId,
                id: { not: id },
                busId: existing.busId,
                status: { in: activeStatuses },
                OR: [
                  { departureAt: { gte: departureAt } },
                  {
                    departureAt: { lt: departureAt },
                    OR: [
                      { arrivalAt: null },
                      { arrivalAt: { gt: departureAt } },
                    ],
                  },
                ],
              },
              select: { departureAt: true, arrivalAt: true },
            });
        if (overlappingBusTrip) {
          throw new ConflictException(
            'الحافلة مشغولة برحلة أخرى في هذه الفترة',
          );
        }
      }

      const effectiveDriverId =
        driverId !== undefined ? driver?.id ?? null : existing.driverId;
      if (effectiveDriverId && (scheduleChanged || driverId !== undefined)) {
        const overlappingDriverTrip = arrivalAt
          ? await tx.trip.findFirst({
              where: {
                organizationId,
                id: { not: id },
                driverId: effectiveDriverId,
                status: { in: activeStatuses },
                OR: [
                  {
                    departureAt: { lt: arrivalAt },
                    arrivalAt: { gt: departureAt },
                  },
                  {
                    departureAt: { gte: departureAt, lt: arrivalAt },
                    arrivalAt: null,
                  },
                ],
              },
              select: { departureAt: true, arrivalAt: true },
            })
          : await tx.trip.findFirst({
              where: {
                organizationId,
                id: { not: id },
                driverId: effectiveDriverId,
                status: { in: activeStatuses },
                OR: [
                  { departureAt: { gte: departureAt } },
                  {
                    departureAt: { lt: departureAt },
                    OR: [
                      { arrivalAt: null },
                      { arrivalAt: { gt: departureAt } },
                    ],
                  },
                ],
              },
              select: { departureAt: true, arrivalAt: true },
            });
        if (overlappingDriverTrip) {
          throw new ConflictException(
            'السائق مشغول برحلة أخرى في هذه الفترة',
          );
        }
      }

      try {
        if (price !== undefined) {
          // تحديث سعر المقاعد المتاحة فقط (غير المحجوزة/المقفلة مؤقتاً)
          await tx.tripSeat.updateMany({
            where: { tripId: id, status: 'AVAILABLE' },
            data: { price: new Prisma.Decimal(price) },
          });
        }
        return await tx.trip.update({
          where: { id },
          data: {
            ...data,
            driverId: driverId !== undefined ? driver?.id ?? null : undefined,
            driverName:
              driverId !== undefined
                ? driver?.name ?? data.driverName ?? null
                : data.driverName,
            driverPhone:
              driverId !== undefined
                ? driver?.phone ?? data.driverPhone ?? null
                : data.driverPhone,
            departureAt: data.departureAt
              ? new Date(data.departureAt)
              : undefined,
            arrivalAt:
              data.arrivalAt !== undefined
                ? data.arrivalAt
                  ? new Date(data.arrivalAt)
                  : null
                : undefined,
          },
          include: {
            route: true,
            bus: { include: { seatTemplate: true } },
            driver: true,
            tripSeats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes('23P01') ||
          message.includes('trips_bus_schedule_no_overlap_excl') ||
          message.includes('trips_driver_schedule_no_overlap_excl')
        ) {
          throw new ConflictException(
            'يوجد تعارض زمني في جدولة الحافلة أو السائق',
          );
        }
        throw error;
      }
    });
  }

  async open(user: AuthUser, id: string) {
    const organizationId = requireOrgId(user);
    const result = await this.prisma.$transaction(async (tx) => {
      await lockTripTransaction(tx, organizationId, id);
      const trip = await tx.trip.findFirst({
        where: { id, ...tenantScope(user) },
      });
      if (!trip) throw new NotFoundException('الرحلة غير موجودة');
      if (trip.status === TripStatus.OPEN) return { trip, changed: false };
      if (trip.status !== TripStatus.SCHEDULED) {
        throw new ConflictException(
          'لا يمكن فتح الحجز لرحلة ليست في الحالة المجدولة',
        );
      }
      const opened = await tx.trip.update({
        where: { id },
        data: { status: TripStatus.OPEN },
        include: {
          route: true,
          bus: { include: { seatTemplate: true } },
          driver: true,
          tripSeats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
        },
      });
      return { trip: opened, changed: true };
    });
    if (result.changed) {
      await this.audit.log(user, 'TRIP_OPENED_FOR_BOOKING', 'Trip', id);
    }
    return result.trip;
  }

  async complete(user: AuthUser, id: string) {
    const organizationId = requireOrgId(user);
    const result = await this.prisma.$transaction(async (tx) => {
      await lockTripTransaction(tx, organizationId, id);
      const trip = await tx.trip.findFirst({
        where: { id, ...tenantScope(user) },
      });
      if (!trip) throw new NotFoundException('الرحلة غير موجودة');
      if (trip.status === TripStatus.COMPLETED) return { trip, changed: false };
      if (trip.status !== TripStatus.DEPARTED) {
        throw new ConflictException(
          'لا يمكن إكمال الرحلة قبل أن تصبح في حالة غادرت',
        );
      }
      const completed = await tx.trip.update({
        where: { id },
        data: { status: TripStatus.COMPLETED },
        include: {
          route: true,
          bus: { include: { seatTemplate: true } },
          driver: true,
          tripSeats: { orderBy: [{ row: 'asc' }, { column: 'asc' }] },
        },
      });
      return { trip: completed, changed: true };
    });
    if (result.changed) {
      await this.audit.log(user, 'TRIP_COMPLETED', 'Trip', id);
    }
    return result.trip;
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
      if (trip.status === TripStatus.DEPARTED) {
        throw new ConflictException('لا يمكن إلغاء رحلة غادرت بالفعل');
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
