"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { checkInTicket, fetchTicketById, fetchTicketByQr } from "../api";

export function useFindTicket() {
  return useMutation({
    mutationFn: ({ value, mode }: { value: string; mode: "code" | "id" }) =>
      mode === "code" ? fetchTicketByQr(value) : fetchTicketById(value),
  });
}

export function useCheckInTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => checkInTicket(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
