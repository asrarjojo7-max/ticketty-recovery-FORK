"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu } from "lucide-react";
import { navigation, type NavItem } from "@/config/navigation";
import { useSession } from "@/components/layout/session-context";
import { filterNavigation } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const rolePriorities: Record<string, string[]> = {
  OWNER: ["/dashboard", "/pos", "/bookings", "/financial"],
  OPS_MANAGER: ["/dashboard", "/trips", "/manifests", "/boarding"],
  FINANCE: ["/dashboard", "/financial", "/accounting", "/agents"],
  STATION_MANAGER: ["/dashboard", "/pos", "/bookings", "/boarding"],
  SELLER: ["/pos", "/bookings", "/boarding", "/dashboard"],
  AGENT: ["/pos", "/bookings", "/agents", "/dashboard"],
  VIEWER: ["/dashboard", "/bookings", "/trips", "/financial"],
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * وصول سريع للهاتف بحسب صلاحيات الدور. لا يظهر داخل POS لأن شريط السلة
 * يشغل الحافة السفلية هناك، بينما تبقى القائمة الجانبية متاحة دائمًا.
 */
export function MobileBottomNav({
  onMoreClick,
  menuOpen,
}: {
  onMoreClick: () => void;
  menuOpen: boolean;
}) {
  const pathname = usePathname();
  const user = useSession();

  if (pathname === "/pos" || pathname.startsWith("/pos/")) return null;

  const permitted = filterNavigation(navigation, user.permissions)
    .flatMap((section) => section.items)
    .reduce<NavItem[]>((items, item) => {
      if (!items.some((existing) => existing.href === item.href)) items.push(item);
      return items;
    }, []);

  const priorityPaths = rolePriorities[user.roleKey] ?? ["/dashboard"];
  const prioritized = priorityPaths
    .map((href) => permitted.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));
  const remaining = permitted.filter(
    (item) => !prioritized.some((preferred) => preferred.href === item.href),
  );
  const items = [...prioritized, ...remaining].slice(0, 4);
  if (items.length === 0) {
    items.push({ title: "الرئيسية", href: "/dashboard", icon: LayoutDashboard });
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-2 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] shadow-elevated backdrop-blur lg:hidden"
      aria-label="اختصارات الهاتف"
    >
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold transition-colors",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="max-w-full truncate">{item.title}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMoreClick}
          aria-controls="app-sidebar"
          aria-expanded={menuOpen}
          className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>المزيد</span>
        </button>
      </div>
    </nav>
  );
}
