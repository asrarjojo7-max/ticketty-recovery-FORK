"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Branded page header used by all authenticated pages (ticket-master DNA).
 * Renders a compact gradient hero band with eyebrow, title, subtitle, optional
 * icon, and an actions slot (buttons, dialogs, etc.).
 * Pure presentation — no data fetching.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-soft p-4 shadow-card sm:p-5 lg:p-6">
      <div
        className="pointer-events-none absolute -end-16 -top-16 h-40 w-40 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--color-primary-glow)" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-16 -start-10 h-40 w-40 rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--color-accent)" }}
        aria-hidden="true"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div>
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-0.5 font-display text-2xl font-extrabold text-foreground lg:text-3xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
