import { apiClient } from "@/lib/api-client";
import type { TicketValidationResult } from "@/features/bookings/types";
import type { BoardingTicket } from "./types";

export function fetchTicketByQr(qrCode: string): Promise<BoardingTicket> {
  return apiClient<BoardingTicket>(`/tickets/by-qr/${encodeURIComponent(qrCode)}`);
}

export function fetchTicketById(ticketId: string): Promise<BoardingTicket> {
  return apiClient<BoardingTicket>(`/tickets/${encodeURIComponent(ticketId)}`);
}

export function checkInTicket(ticketId: string): Promise<BoardingTicket> {
  return apiClient<BoardingTicket>(`/tickets/${encodeURIComponent(ticketId)}/check-in`, { method: "POST" });
}

/**
 * التحقق الرسمي من الباركود/الرقم — الخادم هو مصدر السلطة:
 * يسترجع التذكرة الفعلية ويقيّم صلاحيتها (صالحة/ملغاة/صعد/دفع/رحلة)
 * ويعيد حالة معيارية مع بيانات المسافر عند النجاح.
 */
export function validateTicketCode(
  code: string,
  tripId?: string,
): Promise<TicketValidationResult> {
  return apiClient<TicketValidationResult>("/tickets/validate", {
    method: "POST",
    body: { code, ...(tripId ? { tripId } : {}) },
  });
}
