"use client";

import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./charts";

export type Tone = "primary" | "success" | "accent" | "warning" | "destructive";

const toneIconBg: Record<Tone, string> = {
  primary: "bg-gradient-primary text-primary-foreground shadow-glow",
  success: "bg-success/15 text-success",
  accent: "bg-gradient-navy text-brand-navy-foreground",
  warning: "bg-warning/20 text-warning-foreground",
  destructive: "bg-destructive/15 text-destructive",
};

/** ±% vs yesterday pill. Colors: low-alpha bg + saturated text (DNA rule). */
export function DeltaPill({
  value,
  onDark,
}: {
  value: number;
  onDark?: boolean;
}) {
  const up = value >= 0;
  const cls = onDark
    ? up
      ? "bg-success/90 text-success-foreground"
      : "bg-destructive/90 text-destructive-foreground"
    : up
      ? "bg-success/15 text-success"
      : "bg-destructive/15 text-destructive";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular",
        cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {value}%
    </span>
  );
}

/**
 * ticket-master DNA KPI tile. Presentation only — every number arrives
 * pre-computed from a backend aggregation endpoint.
 */
export function KpiCard({
  label,
  value,
  suffix,
  icon: Icon,
  tone,
  delta,
  spark,
  hint,
  progress,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: LucideIcon;
  tone: Tone;
  delta?: number | null;
  spark?: number[];
  hint?: string;
  progress?: number;
}) {
  return (
    <article className="group relative flex min-h-40 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-card transition-[border-color,box-shadow] hover:border-primary/20 hover:shadow-elevated sm:p-5">
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-xl",
            toneIconBg[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        {typeof delta === "number" && <DeltaPill value={delta} />}
      </div>
      <p className="mt-3 text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-extrabold tabular text-foreground sm:text-3xl">
          {value}
        </span>
        {suffix && (
          <span className="text-xs font-semibold text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {spark && spark.some((v) => v > 0) && <Sparkline values={spark} tone={tone} />}
      {typeof progress === "number" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      {hint && <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>}
    </article>
  );
}
