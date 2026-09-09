import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes, resolving conflicts (rightmost wins).
 * Standard shadcn/ui helper.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as currency in SDG (Sudanese Pound).
 * الأرقام فقط — بلا رمز عملة (للاستخدام داخل جمل مركّبة).
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ar-SD", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * المبلغ المالي الموحّد للعرض في كل النظام — الأرقام + وحدة العملة SDG.
 * مثال: 25000 → "25,000 SDG"
 * (عرض فقط؛ القيم المخزنة وطريقة الحساب لا تتغير إطلاقًا.)
 */
export function formatMoney(amount: number | string): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return `${formatCurrency(Number.isFinite(value) ? value : 0)} SDG`;
}

/**
 * Format a relative date string (e.g. "منذ 3 ساعات").
 */
export function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  if (diffHr < 24) return `منذ ${diffHr} ساعة`;
  if (diffDay < 30) return `منذ ${diffDay} يوم`;
  return new Intl.DateTimeFormat("ar-SD").format(date);
}

/**
 * Format a compact number (e.g. 1,248 → "1.2K").
 */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat("ar-SD", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}