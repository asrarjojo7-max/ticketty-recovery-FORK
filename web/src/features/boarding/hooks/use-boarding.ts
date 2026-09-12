"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { validateTicketCode, checkInTicket } from "../api";

/**
 * التحقق الرسمي من التذكرة — مسار واحد لكل المصادر (كاميرا/يدوي):
 * الخادم يسترجع التذكرة الحقيقية من التوكِن/الرقم ويعيد حالة معيارية.
 * لا نتحقق محليًا أبدًا — الباركود مجرد مفتاح استرجاع.
 */
export function useBoardingValidate() {
  return useMutation({
    mutationFn: (input: { code: string; tripId?: string }) =>
      validateTicketCode(input.code, input.tripId),
  });
}

export function useCheckInTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => checkInTicket(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["trip-seats"] });
    },
  });
}
