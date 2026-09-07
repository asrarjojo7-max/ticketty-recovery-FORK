"use client";

import { cn } from "@/lib/utils";

/**
 * The single renderer of status vocabulary across the app (ticket-master DNA).
 * Business status enums map here to Arabic labels + tone classes.
 * Status colors are ALWAYS low-alpha background with saturated text —
 * never solid fills — so dense tables never look like confetti.
 */

type StatusItem = { cls: string; label: string };

const BOOKING_STATUS: Record<string, StatusItem> = {
  CONFIRMED: { cls: "bg-success/15 text-success", label: "مؤكد" },
  PENDING: { cls: "bg-warning/20 text-warning-foreground", label: "معلّق" },
  CANCELLED: { cls: "bg-destructive/15 text-destructive", label: "ملغى" },
  REFUNDED: { cls: "bg-muted text-muted-foreground", label: "مسترد" },
  PARTIALLY_CANCELLED: { cls: "bg-warning/20 text-warning-foreground", label: "ملغى جزئياً" },
  COMPLETED: { cls: "bg-primary-soft text-primary", label: "مكتمل" },
  EXPIRED: { cls: "bg-muted text-muted-foreground", label: "منتهي" },
};

const TRIP_STATUS: Record<string, StatusItem> = {
  SCHEDULED: { cls: "bg-primary-soft text-primary", label: "مجدولة" },
  OPEN: { cls: "bg-success/15 text-success", label: "مفتوحة" },
  FULL: { cls: "bg-warning/20 text-warning-foreground", label: "مكتملة" },
  BOARDING: { cls: "bg-accent-soft text-accent", label: "صعود" },
  DEPARTED: { cls: "bg-accent-soft text-accent", label: "انطلقت" },
  COMPLETED: { cls: "bg-muted text-muted-foreground", label: "مكتملة" },
  CANCELLED: { cls: "bg-destructive/15 text-destructive", label: "ملغاة" },
};

const TICKET_STATUS: Record<string, StatusItem> = {
  ISSUED: { cls: "bg-success/15 text-success", label: "صادرة" },
  BOOKED: { cls: "bg-primary-soft text-primary", label: "محجوزة" },
  CHECKED_IN: { cls: "bg-accent-soft text-accent", label: "تم الصعود" },
  USED: { cls: "bg-muted text-muted-foreground", label: "مستخدمة" },
  CANCELLED: { cls: "bg-destructive/15 text-destructive", label: "ملغاة" },
  REFUNDED: { cls: "bg-muted text-muted-foreground", label: "مستردة" },
  EXPIRED: { cls: "bg-muted text-muted-foreground", label: "منتهية" },
  NO_SHOW: { cls: "bg-warning/20 text-warning-foreground", label: "لم يحضر" },
};

const PAYMENT_STATUS: Record<string, StatusItem> = {
  PENDING: { cls: "bg-warning/20 text-warning-foreground", label: "معلّق" },
  COMPLETED: { cls: "bg-success/15 text-success", label: "مكتمل" },
  FAILED: { cls: "bg-destructive/15 text-destructive", label: "فاشل" },
  CANCELLED: { cls: "bg-muted text-muted-foreground", label: "ملغى" },
  PARTIALLY_REFUNDED: { cls: "bg-warning/20 text-warning-foreground", label: "مسترد جزئياً" },
  REFUNDED: { cls: "bg-muted text-muted-foreground", label: "مسترد" },
};

const SETTLEMENT_STATUS: Record<string, StatusItem> = {
  PENDING: { cls: "bg-warning/20 text-warning-foreground", label: "قيد الانتظار" },
  DRAFT: { cls: "bg-warning/20 text-warning-foreground", label: "مسودة" },
  SETTLED: { cls: "bg-success/15 text-success", label: "مُسوّاة" },
  APPROVED: { cls: "bg-primary-soft text-primary", label: "معتمدة" },
  POSTED: { cls: "bg-muted text-muted-foreground", label: "مرحّلة" },
  CANCELLED: { cls: "bg-destructive/15 text-destructive", label: "ملغاة" },
};

const EXPENSE_STATUS: Record<string, StatusItem> = {
  DRAFT: { cls: "bg-warning/20 text-warning-foreground", label: "مسودة" },
  SUBMITTED: { cls: "bg-primary-soft text-primary", label: "مقدّم" },
  APPROVED: { cls: "bg-success/15 text-success", label: "معتمد" },
  REJECTED: { cls: "bg-destructive/15 text-destructive", label: "مرفوض" },
  POSTED: { cls: "bg-muted text-muted-foreground", label: "مرحّل" },
  CANCELLED: { cls: "bg-destructive/15 text-destructive", label: "ملغى" },
};

export type StatusDomain =
  | "booking"
  | "trip"
  | "ticket"
  | "payment"
  | "settlement"
  | "expense";

const DOMAIN_MAPS: Record<StatusDomain, Record<string, StatusItem>> = {
  booking: BOOKING_STATUS,
  trip: TRIP_STATUS,
  ticket: TICKET_STATUS,
  payment: PAYMENT_STATUS,
  settlement: SETTLEMENT_STATUS,
  expense: EXPENSE_STATUS,
};

export function StatusBadge({
  status,
  domain = "booking",
  className,
}: {
  status: string;
  domain?: StatusDomain;
  className?: string;
}) {
  const item = DOMAIN_MAPS[domain][status] ?? {
    cls: "bg-muted text-muted-foreground",
    label: status,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
        item.cls,
        className,
      )}
    >
      {item.label}
    </span>
  );
}
