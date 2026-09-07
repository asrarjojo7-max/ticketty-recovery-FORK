"use client";

import { cn } from "@/lib/utils";

/**
 * Loading skeletons that match final layout geometry (ticket-master DNA):
 * loading states must never look like generic bars — they mirror the shape of
 * the screen they stand in for, so the transition is calm.
 */

/** Table skeleton with pseudo-random cell widths for a natural look. */
export function TableSkeleton({
  rows = 5,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  const widths = ["w-24", "w-32", "w-20", "w-28", "w-16", "w-36", "w-40"];
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-card",
        className,
      )}
      aria-busy="true"
      aria-label="جارٍ التحميل"
    >
      <div className="flex gap-4 border-b border-border bg-muted/40 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 flex-1 rounded bg-muted" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div
                key={c}
                className={cn(
                  "h-4 flex-1 rounded-full bg-muted/80",
                  widths[(r + c) % widths.length],
                )}
                style={{ maxWidth: `${60 + ((r * 7 + c * 13) % 40)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Card grid skeleton matching the real card layout. */
export function CardGridSkeleton({
  count = 6,
  cols = 3,
  className,
}: {
  count?: number;
  cols?: number;
  className?: string;
}) {
  const gridCols =
    cols === 2 ? "sm:grid-cols-2" : cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={cn("grid gap-4", gridCols, className)} aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-card p-5 shadow-card"
        >
          <div className="flex items-start justify-between">
            <div className="h-11 w-11 rounded-2xl bg-muted" />
            <div className="h-5 w-12 rounded-full bg-muted" />
          </div>
          <div className="mt-4 h-3 w-20 rounded bg-muted" />
          <div className="mt-2 h-7 w-28 rounded-full bg-muted/80" />
          <div className="mt-3 h-2 w-full rounded-full bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

/** Dashboard hero skeleton matching the hero + KPI row geometry. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="جارٍ تحميل لوحة التحكم">
      <div className="h-44 rounded-3xl bg-muted/60" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-3xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-start justify-between">
              <div className="h-11 w-11 rounded-2xl bg-muted" />
              <div className="h-5 w-12 rounded-full bg-muted" />
            </div>
            <div className="mt-4 h-3 w-24 rounded bg-muted" />
            <div className="mt-2 h-8 w-28 rounded-full bg-muted/80" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-80 rounded-3xl bg-muted/60 lg:col-span-2" />
        <div className="h-80 rounded-3xl bg-muted/60" />
      </div>
    </div>
  );
}
