"use client";

import Link from "next/link";
import { PlusCircle } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ticket-master DNA empty state: glowing icon tile, bold title, muted
 * description, optional CTA link. Pure presentation.
 * `icon` accepts a component type (Lucide icons, forwardRef components) or
 * a ready ReactNode (legacy call sites pass <Icon className/> elements).
 */
export function EmptyState({
  icon,
  title,
  desc,
  description,
  ctaLabel,
  ctaHref,
  className,
}: {
  icon?: ComponentType<{ className?: string }> | ReactNode;
  title: string;
  desc?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
  className?: string;
}) {
  const text = desc ?? description;
  const isComponent =
    typeof icon === "function" ||
    (typeof icon === "object" && icon !== null && "render" in icon);
  const Icon = isComponent
    ? (icon as ComponentType<{ className?: string }>)
    : null;
  const node = !isComponent ? (icon as ReactNode) : null;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-10 text-center",
        className,
      )}
    >
      {(Icon || node) && (
        <div className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary [&_svg]:h-6 [&_svg]:w-6">
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-40 blur-xl"
            style={{ background: "var(--color-primary)" }}
            aria-hidden="true"
          />
          {Icon ? <Icon className="h-6 w-6" /> : node}
        </div>
      )}
      <p className="mt-1 text-sm font-bold text-foreground">{title}</p>
      {text && <p className="max-w-xs text-xs text-muted-foreground">{text}</p>}
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-glow transition hover:-translate-y-0.5"
        >
          <PlusCircle className="h-3.5 w-3.5" />
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
