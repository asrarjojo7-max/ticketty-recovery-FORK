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
    bus: Omit<BusSummary, "seatTemplate"> & { totalSeats?: number };
    bookable: boolean;
  };
  layout: {
    rows: number;
    columnsPerRow: number;
    aisleAfterColumn: number;
    /** موضع السائق/الأبواب داخل الحافلة — مشتق من التكوين في الخادم. */
    driverPosition?: "FRONT_LEFT";
    entranceDoor?: "FRONT_RIGHT";
    rearDoor?: "LEFT" | "RIGHT" | "NONE";
  };
  summary?: {
    total: number;
    sold: number;
    available: number;
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
  /** توكِن الصعود — هو ما يرمّزه الباركود المطبوع (TB-…). */
  boardingToken?: string | null;
  printedAt?: string | null;
  boardedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * نتيجة التحقق الرسمي من التذكرة (بوابة الصعود) — نفس مفردات الخادم.
 * الخادم هو مصدر السلطة؛ الباركود مجرد مفتاح استرجاع.
 */
export type TicketValidationCode =
  | "VALID"
  | "ALREADY_BOARDED"
  | "CANCELLED"
  | "REFUNDED"
  | "NOT_FOUND"
  | "PAYMENT_PENDING"
  | "WRONG_TRIP"
  | "BOARDING_CLOSED";

export interface TicketValidationResult {
  code: TicketValidationCode;
  message: string;
  boardable: boolean;
  ticket: {
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
      departureAt: string;
      driverName: string | null;
      route: { name: string; fromCity: string; toCity: string };
      bus: { plateNumber: string; model: string | null } | null;
    };
    booking: {
      id: string;
      status: string;
      paymentStatus: "PAID" | "PENDING";
    };
  } | null;
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
