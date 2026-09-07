import type { BusSummary, TransportRoute, TripStatus } from "@/features/trips";

export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED" | "BLOCKED";
export type SeatType = "REGULAR" | "VIP" | "DRIVER" | "DISABLED" | "BLOCKED";
export type PaymentMethod = "CASH" | "CARD" | "BANKAK" | "MTN_MOMO" | "ZAIN_CASH" | "BANK_TRANSFER";
export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "REFUNDED";
export type TicketStatus = "BOOKED" | "CHECKED_IN" | "CANCELLED" | "REFUNDED" | "NO_SHOW";

export interface TripSeat {
  id: string;
  tripId: string;
  row: number;
  column: number;
  label: string;
  seatType: SeatType;
  price: string;
  status: SeatStatus;
  heldByUserId: string | null;
  holdExpiresAt: string | null;
  ticketId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripSeatsResponse {
  trip: {
    id: string;
    routeId: string;
    busId: string;
    departureAt: string;
    arrivalAt: string | null;
    status: TripStatus;
    driverName: string | null;
    driverPhone: string | null;
    route: TransportRoute;
    bus: Omit<BusSummary, "seatTemplate">;
    bookable: boolean;
  };
  layout: {
    rows: number;
    columnsPerRow: number;
    aisleAfterColumn: number;
  };
  seats: TripSeat[];
}

export interface BookingFilters {
  tripId?: string;
  date?: string;
  search?: string;
  status?: BookingStatus;
  /** Server pagination (backend: page 1-based, limit default 50 max 200). */
  page?: number;
  limit?: number;
}

export interface CreateBookingInput {
  tripId: string;
  seatIds: string[];
  passengers?: Array<{
    seatId: string;
    passengerName: string;
    passengerPhone: string;
    passengerNationalId?: string;
  }>;
  passengerName?: string;
  passengerPhone?: string;
  passengerNationalId?: string;
  boardingStop?: string;
  dropOffStop?: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  notes?: string;
}

export interface Ticket {
  id: string;
  organizationId: string;
  bookingId: string;
  tripId: string;
  tripSeatId: string;
  number: string;
  passengerName: string;
  passengerPhone: string;
  passengerNationalId: string | null;
  seatLabel: string;
  boardingStop: string | null;
  dropOffStop: string | null;
  fare: string;
  status: TicketStatus;
  qrCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  createdAt: string;
}

export interface Booking {
  id: string;
  organizationId: string;
  tripId: string;
  totalAmount: string;
  status: BookingStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tickets: Ticket[];
  payments: Payment[];
  trip: {
    id: string;
    routeId: string;
    busId: string;
    departureAt: string;
    arrivalAt: string | null;
    status: TripStatus;
    route: TransportRoute;
    bus?: Omit<BusSummary, "seatTemplate">;
  };
}

export interface SeatHoldResponse {
  held: true;
  seatId: string;
  expiresAt: string;
}
