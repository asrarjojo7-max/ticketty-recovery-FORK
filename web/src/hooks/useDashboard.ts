"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDashboardStats } from "@/lib/api/dashboard";

/**
 * Custom hook — الجلب الوحيد لبيانات لوحة التحكم.
 * يدير الـ server state (loading / error / caching / refetch) عبر TanStack Query.
 */
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: fetchDashboardStats,
    staleTime: 60_000, // 1 min
    refetchInterval: 60_000, // live board: auto-refresh every minute
  });
}

// Backward-compatible alias for existing consumers.
export const useDashboard = useDashboardStats;