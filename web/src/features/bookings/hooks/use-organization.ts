"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchOrganizationForTicket } from "../api";

/**
 * بيانات الشركة للتذكرة المطبوعة (الاسم/الهاتف/شروط السفر) — تُقرأ
 * مرة واحدة وتُخزَّن مؤقتًا للجلسة؛ بيانات ثابتة نادرة التغيير.
 */
export function useOrganizationForTicket() {
  return useQuery({
    queryKey: ["organization", "ticket"],
    queryFn: fetchOrganizationForTicket,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
