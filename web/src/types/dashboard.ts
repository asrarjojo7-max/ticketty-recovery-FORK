// ─── Dashboard domain types ────────────────────────────────────

export type TrendDirection = "up" | "down" | "neutral";

export interface KpiStat {
  id: string;
  title: string;
  value: number;
  /** Optional prefix/suffix for display (e.g. currency). */
  format: "number" | "currency";
  change: number; // percentage
  changeDirection: TrendDirection;
  period: string;
  icon: string; // lucide icon name
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  bookings: number;
}

export interface BookingDistribution {
  name: string;
  value: number;
  color: string;
}

export type ActivityStatus = "completed" | "pending" | "failed";

export interface ActivityItem {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  user: string;
  createdAt: string;
  status: ActivityStatus;
}

/** Fleet readiness counts (server-side aggregation — BusStatus vocabulary). */
export interface BusCounts {
  active: number;
  maintenance: number;
  inactive: number;
}

/** Upcoming trip with server-computed capacity/occupancy (no client math). */
export interface UpcomingTrip {
  id: string;
  departureAt: string;
  route: string;
  busPlate: string | null;
  capacity: number;
  booked: number;
  occupancy: number; // 0..100
}

export interface DashboardStats {
  kpis: KpiStat[];
  revenueSeries: RevenuePoint[];
  bookingDistribution: BookingDistribution[];
  recentActivity: ActivityItem[];
  busCounts: BusCounts;
  avgOccupancy: number;
  upcomingTrips: UpcomingTrip[];
}
