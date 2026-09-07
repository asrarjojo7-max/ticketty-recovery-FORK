import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { requireOrgId } from '../common/org';
import { PrismaService } from '../prisma/prisma.service';
import { QueryReportDto } from './dto';

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

const DAY_LABELS = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

const MAX_REPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export function reportRange(
  query: QueryReportDto,
  now = new Date(),
): { gte: Date; lte: Date } {
  const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : now;
  const from = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : startOfDay(to);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new BadRequestException('Invalid report date range');
  }
  if (to.getTime() - from.getTime() > MAX_REPORT_RANGE_MS) {
    throw new BadRequestException('Report date range cannot exceed 366 days');
  }

  return { gte: from, lte: to };
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة',
  BANKAK: 'بنكك',
  MTN_MOMO: 'موبايل MTN',
  ZAIN_CASH: 'زين كاش',
  BANK_TRANSFER: 'تحويل بنكي',
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: AuthUser) {
    const orgId = requireOrgId(user);
    const branch = user.branchId ? { branchId: user.branchId } : {};
    const start = startOfDay(new Date());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const yesterdayStart = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(start.getTime() - 6 * 24 * 60 * 60 * 1000);

    const now = new Date();
    const [
      totalBookings,
      revenueToday,
      revenueYesterday,
      tripsToday,
      ticketsSoldToday,
      customers,
      agents,
      buses,
      expensesToday,
      recentBookings,
      paymentsLast7Days,
      paymentsByMethod,
      busStatusGroups,
      upcomingTripRows,
    ] = await Promise.all([
      this.prisma.booking.count({
        where: { organizationId: orgId, ...branch },
      }),
      this.prisma.payment.aggregate({
        where: {
          organizationId: orgId,
          ...branch,
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          organizationId: orgId,
          ...branch,
          createdAt: { gte: yesterdayStart, lt: start },
        },
        _sum: { amount: true },
      }),
      this.prisma.trip.count({
        where: {
          organizationId: orgId,
          ...branch,
          departureAt: { gte: start, lt: end },
        },
      }),
      this.prisma.ticket.count({
        where: {
          organizationId: orgId,
          ...(user.branchId ? { trip: { branchId: user.branchId } } : {}),
          createdAt: { gte: start, lt: end },
        },
      }),
      this.prisma.customer.count({
        where: { organizationId: orgId, ...branch },
      }),
      this.prisma.agent.count({
        where: { organizationId: orgId, ...branch, active: true },
      }),
      this.prisma.bus.count({ where: { organizationId: orgId, ...branch } }),
      this.prisma.expense.aggregate({
        where: {
          organizationId: orgId,
          ...branch,
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
      }),
      this.prisma.booking.findMany({
        where: { organizationId: orgId, ...branch },
        include: {
          trip: { include: { route: true } },
          tickets: true,
          agent: true,
          customer: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.payment.findMany({
        where: {
          organizationId: orgId,
          ...branch,
          createdAt: { gte: sevenDaysAgo, lt: end },
        },
        select: { amount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { organizationId: orgId, ...branch },
        _count: true,
      }),
      this.prisma.bus.groupBy({
        by: ['status'],
        where: { organizationId: orgId, ...branch },
        _count: true,
      }),
      this.prisma.trip.findMany({
        where: {
          organizationId: orgId,
          ...branch,
          departureAt: {
            gte: now,
            lt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          },
          status: { in: ['SCHEDULED', 'OPEN'] },
        },
        include: {
          route: true,
          bus: { include: { seatTemplate: true } },
          tripSeats: { select: { status: true } },
        },
        orderBy: { departureAt: 'asc' },
        take: 5,
      }),
    ]);

    const revenueTodayValue = Number(revenueToday._sum.amount ?? 0);
    const revenueYesterdayValue = Number(revenueYesterday._sum.amount ?? 0);

    // Fleet readiness (bus status vocabulary: READY/MAINTENANCE/OUT_OF_SERVICE)
    const busCounts = { active: 0, maintenance: 0, inactive: 0 };
    for (const group of busStatusGroups) {
      if (group.status === 'READY') busCounts.active = group._count;
      else if (group.status === 'MAINTENANCE')
        busCounts.maintenance = group._count;
      else if (group.status === 'OUT_OF_SERVICE')
        busCounts.inactive = group._count;
    }

    // Upcoming trips (48h window) with capacity/occupancy computed server-side
    const upcomingTrips = upcomingTripRows.map((t) => {
      const capacity = t.tripSeats.length;
      const booked = t.tripSeats.filter((s) => s.status === 'BOOKED').length;
      return {
        id: t.id,
        departureAt: t.departureAt.toISOString(),
        route: `${t.route.fromCity} → ${t.route.toCity}`,
        busPlate: t.bus?.plateNumber ?? null,
        capacity,
        booked,
        occupancy: capacity > 0 ? Math.round((booked / capacity) * 100) : 0,
      };
    });

    // Average occupancy across sampled upcoming trips (server-side math only)
    const occSamples = upcomingTrips.filter((t) => t.capacity > 0);
    const avgOccupancy = occSamples.length
      ? Math.round(
          (occSamples.reduce((s, t) => s + t.booked / t.capacity, 0) /
            occSamples.length) *
            100,
        )
      : 0;

    return {
      // KPI raw values
      totalBookings,
      todayRevenue: revenueTodayValue,
      revenueYesterday: revenueYesterdayValue,
      tripsToday,
      ticketsSoldToday,
      customers,
      agents,
      buses,
      expensesToday: Number(expensesToday._sum.amount ?? 0),

      // Charts
      revenueSeries: this.buildRevenueSeries(paymentsLast7Days, sevenDaysAgo),
      bookingDistribution: paymentsByMethod.map((p) => ({
        method: p.method,
        label: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
        count: p._count,
      })),

      // Fleet + occupancy (server-side aggregation)
      busCounts,
      avgOccupancy,
      upcomingTrips,

      // Activity
      recentActivity: recentBookings.map((b) => {
        const status =
          b.status === 'CONFIRMED'
            ? 'completed'
            : b.status === 'PENDING'
              ? 'pending'
              : 'failed';
        return {
          id: b.id,
          action: 'حجز جديد',
          entity: 'Booking',
          entityId: b.tickets[0]?.number ?? b.id.slice(-8).toUpperCase(),
          user: b.agent?.name ?? b.customer?.name ?? 'مباشر',
          createdAt: b.createdAt.toISOString(),
          status,
        };
      }),
    };
  }

  async sales(user: AuthUser, query: QueryReportDto) {
    const orgId = requireOrgId(user);
    const branch = user.branchId ? { branchId: user.branchId } : {};
    const { gte, lte } = reportRange(query);

    const [aggregate, byMethod] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { organizationId: orgId, ...branch, createdAt: { gte, lte } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: { organizationId: orgId, ...branch, createdAt: { gte, lte } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return {
      total: Number(aggregate._sum.amount ?? 0),
      count: aggregate._count,
      byMethod,
    };
  }

  async financial(user: AuthUser, query: QueryReportDto) {
    const orgId = requireOrgId(user);
    const branch = user.branchId ? { branchId: user.branchId } : {};
    const { gte, lte } = reportRange(query);
    const [payments, expenses, commissions, settlements] = await Promise.all([
      this.prisma.payment.findMany({
        where: { organizationId: orgId, ...branch, createdAt: { gte, lte } },
        select: { amount: true, refundedAmount: true, method: true },
      }),
      this.prisma.expense.findMany({
        where: {
          organizationId: orgId,
          ...branch,
          status: { in: ['APPROVED', 'ADJUSTED'] },
          createdAt: { gte, lte },
        },
        include: { adjustments: true },
      }),
      this.prisma.commission.findMany({
        where: {
          organizationId: orgId,
          ...(user.branchId ? { agent: { branchId: user.branchId } } : {}),
          reversedAt: null,
          createdAt: { gte, lte },
        },
        select: { amount: true },
      }),
      this.prisma.settlement.findMany({
        where: {
          organizationId: orgId,
          ...(user.branchId ? { agent: { branchId: user.branchId } } : {}),
          createdAt: { gte, lte },
        },
        include: { agent: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const revenue = payments.reduce(
      (sum, payment) => sum.plus(payment.amount.minus(payment.refundedAmount)),
      new Prisma.Decimal(0),
    );
    const expenseTotal = expenses.reduce((sum, expense) => {
      const adjusted = expense.adjustments.reduce(
        (value, adjustment) =>
          adjustment.type === 'INCREASE'
            ? value.plus(adjustment.amount)
            : value.minus(adjustment.amount),
        expense.amount,
      );
      return sum.plus(adjusted);
    }, new Prisma.Decimal(0));
    const commissionTotal = commissions.reduce(
      (sum, commission) => sum.plus(commission.amount),
      new Prisma.Decimal(0),
    );
    const byMethod = new Map<string, Prisma.Decimal>();
    for (const payment of payments) {
      const net = payment.amount.minus(payment.refundedAmount);
      byMethod.set(
        payment.method,
        (byMethod.get(payment.method) ?? new Prisma.Decimal(0)).plus(net),
      );
    }

    return {
      revenue: revenue.toNumber(),
      expenses: expenseTotal.toNumber(),
      commissions: commissionTotal.toNumber(),
      netProfit: revenue.minus(expenseTotal).minus(commissionTotal).toNumber(),
      paymentsCount: payments.length,
      byMethod: Array.from(byMethod.entries()).map(([method, amount]) => ({
        method,
        amount: amount.toNumber(),
      })),
      recentSettlements: settlements,
    };
  }

  async occupancy(user: AuthUser, query: QueryReportDto) {
    const orgId = requireOrgId(user);
    const branch = user.branchId ? { branchId: user.branchId } : {};
    const { gte, lte } = reportRange(query);
    const trips = await this.prisma.trip.findMany({
      where: { organizationId: orgId, ...branch, departureAt: { gte, lte } },
      include: {
        route: true,
        bus: true,
        _count: { select: { tripSeats: true } },
        tripSeats: { where: { status: 'BOOKED' }, select: { id: true } },
      },
      orderBy: { departureAt: 'asc' },
    });

    return trips.map((trip) => {
      const total = trip._count.tripSeats;
      const booked = trip.tripSeats.length;
      return {
        id: trip.id,
        route: trip.route.name,
        bus: trip.bus.plateNumber,
        departureAt: trip.departureAt,
        status: trip.status,
        totalSeats: total,
        bookedSeats: booked,
        occupancyRate: total > 0 ? Math.round((booked / total) * 100) : 0,
      };
    });
  }

  private buildRevenueSeries(
    payments: { amount: Prisma.Decimal; createdAt: Date }[],
    from: Date,
  ) {
    const buckets = new Map<string, { revenue: number; bookings: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { revenue: 0, bookings: 0 });
    }

    for (const p of payments) {
      const key = p.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.revenue += Number(p.amount);
        bucket.bookings += 1;
      }
    }

    return Array.from(buckets.entries()).map(([key, value]) => {
      const d = new Date(`${key}T00:00:00Z`);
      return {
        date: DAY_LABELS[d.getUTCDay()],
        revenue: value.revenue,
        bookings: value.bookings,
      };
    });
  }
}
