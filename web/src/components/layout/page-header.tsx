"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * عنوان موحّد لكل صفحات النظام: شبكة ثابتة، تسلسل بصري واضح، وأزرار
 * تلتف بصورة سليمة على الهاتف دون تغيير ترتيب القراءة العربي.
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
    <header className="relative overflow-hidden rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-card sm:px-5 sm:py-5 lg:px-6">
      <span
        aria-hidden="true"
        className="absolute inset-y-4 start-0 w-1 rounded-e-full bg-primary"
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary ring-1 ring-primary/10">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[11px] font-bold tracking-wide text-primary">{eyebrow}</p>
            ) : null}
            <h1 className="mt-0.5 font-display text-xl font-extrabold leading-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground sm:text-sm">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
