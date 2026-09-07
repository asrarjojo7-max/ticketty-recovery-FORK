import type { NavSection } from "../config/navigation";

export function hasPermission(
  granted: readonly string[],
  required: string,
): boolean {
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
