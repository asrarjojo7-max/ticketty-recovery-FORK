export type TripStatus =
  | "SCHEDULED"
  | "OPEN"
  | "FULL"
  | "DEPARTED"
  | "COMPLETED"
  | "CANCELLED";

export type BusStatus = "READY" | "MAINTENANCE" | "OUT_OF_SERVICE";

export interface RouteStop {
  id: string;
  routeId: string;
  city: string;
  order: number;
}

export interface TransportRoute {
  id: string;
  organizationId: string;
  name: string;
  fromCity: string;
  toCity: string;
  distanceKm: number | null;
  durationMinutes: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  stops: RouteStop[];
  _count?: { trips: number };
}

export interface CreateRouteInput {
  name: string;
  fromCity: string;
  toCity: string;
  distanceKm?: number;
  durationMinutes?: number;
  active?: boolean;
  stops?: Array<{ city: string; order: number }>;
}

export type UpdateRouteInput = Partial<CreateRouteInput>;

export interface SeatTemplateSummary {
  id: string;
  name: string;
  rows: number;
  columnsPerRow: number;
  aisleAfterColumn: number;
}

export interface BusSummary {
  id: string;
  organizationId: string;
  plateNumber: string;
  model: string | null;
  year: number | null;
  seatTemplateId: string;
  status: BusStatus;
  createdAt: string;
  updatedAt: string;
  seatTemplate: SeatTemplateSummary;
}

export interface TripDriver {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
}

export interface Trip {
  id: string;
  organizationId: string;
  routeId: string;
  busId: string;
  driverId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driver: TripDriver | null;
  departureAt: string;
  arrivalAt: string | null;
  status: TripStatus;
  manifestLockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  route: TransportRoute;
  bus: BusSummary;
  _count: { tripSeats: number; tickets: number };
}

export interface TripFilters {
  date?: string;
  routeId?: string;
  status?: TripStatus;
  /** Server pagination (page 1-based, limit default 50 max 200). */
  page?: number;
  limit?: number;
}

export interface CreateTripInput {
  routeId: string;
  busId: string;
  driverId?: string;
  departureAt: string;
  arrivalAt?: string;
  driverName?: string;
  driverPhone?: string;
  price: number;
  status?: TripStatus;
}

export interface UpdateTripInput {
  driverId?: string;
  departureAt?: string;
  arrivalAt?: string;
  driverName?: string;
  driverPhone?: string;
  price?: number;
  status?: TripStatus;
}
