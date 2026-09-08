import type { NavSection } from "../config/navigation";

/**
 * platform.admin هي صلاحية مشغّل المنصة (Suda-Technologies) — ليست
 * صلاحية داخل منظمة عميل. النجمة (*) الخاصة بمالك الـ Tenant تعني
 * "كل شيء داخل منظمته" ولا تفتح نطاق المنصة أبداً.
 */
const PLATFORM_SCOPED_PERMISSIONS = new Set(["platform.admin"]);

export function hasPermission(
  granted: readonly string[],
  required: string,
): boolean {
  if (PLATFORM_SCOPED_PERMISSIONS.has(required)) {
    return granted.includes(required);
  }
  if (granted.includes("*") || granted.includes(required)) return true;
  const [domain] = required.split(".");
  return granted.includes(`${domain}.*`);
}

export function hasAnyPermission(
  granted: readonly string[],
  required: readonly string[] = [],
): boolean {
  return required.length === 0 || required.some((item) => hasPermission(granted, item));
}

export function filterNavigation(
  sections: readonly NavSection[],
  permissions: readonly string[],
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        hasAnyPermission(permissions, item.permissions),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
