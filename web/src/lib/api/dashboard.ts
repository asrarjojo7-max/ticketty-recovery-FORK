import { apiClient } from "../api-client";
import type {
  DashboardStats,
  KpiStat,
  RevenuePoint,
  BookingDistribution,
  ActivityItem,
  ActivityStatus,
  TrendDirection,
  BusCounts,
  UpcomingTrip,
} from "@/types/dashboard";

/**
 * Raw response shape from `GET /api/reports/dashboard`.
 * Every number is server-computed (Prisma aggregation) — the client never
 * derives financial figures.
 */
interface ReportsDashboardResponse {
  totalBookings: number;
  todayRevenue: number;
  revenueYesterday: number;
  tripsToday: number;
  ticketsSoldToday: number;
  customers: number;
  agents: number;
  buses: number;
  expensesToday: number;
  revenueSeries: RevenuePoint[];
  bookingDistribution: { method: string; label: string; count: number }[];
  busCounts: BusCounts;
  avgOccupancy: number;
  upcomingTrips: UpcomingTrip[];
  recentActivity: {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    user: string;
    createdAt: string;
    status: ActivityStatus;
  }[];
}

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function revenueTrend(today: number, yesterday: number): {
  change: number;
  direction: TrendDirection;
} {
  if (yesterday <= 0) return { change: 0, direction: "neutral" };
  const change = Math.round(((today - yesterday) / yesterday) * 100);
  return {
    change: Math.abs(change),
    direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
  };
}

function mapToDashboardStats(raw: ReportsDashboardResponse): DashboardStats {
  const revenue = revenueTrend(raw.todayRevenue, raw.revenueYesterday);

  const kpis: KpiStat[] = [
    {
      id: "totalBookings",
      title: "إجمالي الحجوزات",
      value: raw.totalBookings,
      format: "number",
      change: 0,
      changeDirection: "neutral",
      period: "إجمالي",
      icon: "ticket",
    },
    {
      id: "todayRevenue",
      title: "إيرادات اليوم",
      value: raw.todayRevenue,
      format: "currency",
      change: revenue.change,
      changeDirection: revenue.direction,
      period: "مقارنة بالأمس",
      icon: "dollar",
    },
    {
      id: "tripsToday",
      title: "رحلات اليوم",
      value: raw.tripsToday,
      format: "number",
      change: 0,
      changeDirection: "neutral",
      period: "اليوم",
      icon: "bus",
    },
    {
      id: "ticketsSoldToday",
      title: "تذاكر مباعة اليوم",
      value: raw.ticketsSoldToday,
      format: "number",
      change: 0,
      changeDirection: "neutral",
      period: "اليوم",
      icon: "users",
    },
  ];

  const bookingDistribution: BookingDistribution[] =
    raw.bookingDistribution.map((d, i) => ({
      name: d.label,
      value: d.count,
      color: chartColors[i % chartColors.length],
    }));

  const recentActivity: ActivityItem[] = raw.recentActivity.map((a) => ({
    id: a.id,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    user: a.user,
    createdAt: a.createdAt,
    status: a.status,
  }));

  return {
    kpis,
    revenueSeries: raw.revenueSeries,
    bookingDistribution,
    recentActivity,
    busCounts: raw.busCounts,
    avgOccupancy: raw.avgOccupancy,
    upcomingTrips: raw.upcomingTrips,
  };
}

/**
 * جلب بيانات لوحة التحكم من الـ Backend عبر طبقة BFF + TanStack Query.
 */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const raw = await apiClient<ReportsDashboardResponse>("/reports/dashboard");
  return mapToDashboardStats(raw);
}
