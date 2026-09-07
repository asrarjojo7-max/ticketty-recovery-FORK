"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "./kpi-card";

/**
 * Hand-written SVG chart family (ticket-master DNA decision: no chart library
 * on the most-visited screen — exact control of stroke widths, token colors,
 * and RTL label order, and a tiny client bundle).
 * All colors come from CSS variables only. Pure presentation.
 */

const toneVar: Record<Tone, string> = {
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  accent: "var(--color-accent)",
  warning: "var(--color-warning)",
  destructive: "var(--color-destructive)",
};

/** Tiny inline trend line for KPI cards. */
export function Sparkline({
  values,
  tone = "primary",
  className,
}: {
  values: number[];
  tone?: Tone;
  className?: string;
}) {
  const w = 120;
  const h = 28;
  const pad = 2;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => ({
    x: pad + i * step,
    y: pad + (h - pad * 2) * (1 - v / max),
  }));
  const line = points.length
    ? `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`
    : "";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("mt-3 h-7 w-full", className)}
      preserveAspectRatio="none"
      role="img"
      aria-label="اتجاه"
    >
      {line && (
        <path
          d={line}
          fill="none"
          stroke={toneVar[tone]}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export type SeriesPoint = { label: string; value: number };

/** 7-day revenue area+line chart with dashed gridlines and day labels. */
export function RevenueAreaChart({
  data,
  currency,
  valueSuffix,
  ariaLabel = "مخطط الإيرادات",
}: {
  data: SeriesPoint[];
  currency?: string;
  valueSuffix?: string;
  ariaLabel?: string;
}) {
  const w = 640;
  const h = 200;
  const padX = 24;
  const padY = 24;
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => ({
    x: padX + i * step,
    y: padY + (h - padY * 2) * (1 - d.value / max),
    d,
  }));
  const line = points.length
    ? `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`
    : "";
  const area = points.length
    ? `${line} L ${points[points.length - 1].x},${h - padY} L ${points[0].x},${h - padY} Z`
    : "";
  const last = points[points.length - 1];

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-56 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
      >
        {area && (
          <path d={area} fill="var(--color-primary)" fillOpacity="0.12" />
        )}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={padX}
            x2={w - padX}
            y1={padY + (h - padY * 2) * f}
            y2={padY + (h - padY * 2) * f}
            stroke="var(--color-border)"
            strokeDasharray="3 4"
          />
        ))}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={3.5}
              fill="var(--color-card)"
              stroke="var(--color-primary)"
              strokeWidth={2}
            />
          </g>
        ))}
        {last && (
          <circle
            cx={last.x}
            cy={last.y}
            r={7}
            fill="var(--color-primary)"
            opacity={0.25}
          />
        )}
      </svg>
      <div className="flex justify-between px-1 text-[10px] font-semibold text-muted-foreground">
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span>{d.label}</span>
            <span className="tabular text-foreground/80">
              {d.value > 0
                ? d.value.toLocaleString("ar-EG", { maximumFractionDigits: 0 })
                : "—"}
            </span>
          </div>
        ))}
      </div>
      {(currency || valueSuffix) && (
        <p className="text-center text-[10px] text-muted-foreground">
          {valueSuffix ?? `القيم بالـ ${currency}`}
        </p>
      )}
    </div>
  );
}

/** Fleet readiness donut: readiness % in the center, 3 segments around. */
export function FleetDonut({
  counts,
  total,
  ariaLabel = "حالة الأسطول",
}: {
  counts: { active: number; maintenance: number; inactive: number };
  total: number;
  ariaLabel?: string;
}) {
  const size = 160;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const segments: Array<{ value: number; color: string }> = [
    { value: counts.active, color: "var(--color-success)" },
    { value: counts.maintenance, color: "var(--color-warning)" },
    { value: counts.inactive, color: "var(--color-destructive)" },
  ];
  let offset = 0;
  const pct = total > 0 ? Math.round((counts.active / total) * 100) : 0;
  return (
    <div
      className="relative mx-auto flex h-40 w-40 items-center justify-center"
      role="img"
      aria-label={ariaLabel}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={stroke}
        />
        {segments.map((s, i) => {
          const len = total > 0 ? (s.value / total) * c : 0;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-extrabold tabular text-foreground">
          {pct}%
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          جاهزية
        </span>
      </div>
    </div>
  );
}

/** Fleet legend row: icon chip + label + count + percentage. */
export function FleetRow({
  icon: Icon,
  label,
  value,
  total,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  total: number;
  tone: "success" | "warning" | "destructive";
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const dot = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-destructive";
  const chip =
    tone === "success"
      ? "bg-success/15 text-success"
      : tone === "warning"
        ? "bg-warning/20 text-warning-foreground"
        : "bg-destructive/15 text-destructive";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-2.5">
      <div className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${chip}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-1 items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-xs font-semibold text-foreground">{label}</span>
      </div>
      <span className="tabular text-sm font-bold text-foreground">{value}</span>
      <span className="tabular text-[10px] font-bold text-muted-foreground">{pct}%</span>
    </div>
  );
}
