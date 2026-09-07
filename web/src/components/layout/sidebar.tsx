"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { navigation } from "@/config/navigation";
import { useSession } from "@/components/layout/session-context";
import { filterNavigation } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  collapsed: boolean;
  onClose?: () => void;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * ticket-master DNA sidebar: light token surface, tiny uppercase group
 * labels, active item = gradient-primary pill + glow. Nav filtering stays
 * permission-driven (server-issued capabilities) — cosmetic mirror only.
 */
export function Sidebar({ collapsed, onClose }: SidebarProps) {
  const pathname = usePathname();
  const user = useSession();
  const visibleNavigation = filterNavigation(navigation, user.permissions);

  return (
    <>
      {!collapsed ? (
        <button
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-label="إغلاق القائمة"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 z-50 flex w-64 flex-col overflow-hidden border-s border-sidebar-border bg-sidebar text-sidebar-foreground shadow-card transition-transform duration-300 ease-out",
          collapsed ? "translate-x-full lg:translate-x-0" : "translate-x-0",
        )}
        style={{ insetInlineStart: 0 }}
      >
        <div className="relative flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="relative">
              <div
                className="absolute inset-0 rounded-xl bg-gradient-primary opacity-30 blur-md"
                aria-hidden="true"
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
              <img
                src="/brand/logo-48.png"
                alt="شعار Ticketty"
                className="relative h-10 w-10 rounded-xl object-cover shadow-card"
                width={40}
                height={40}
              />
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-extrabold tracking-tight text-primary">
                TICKETTY
              </p>
              <p className="text-[10px] text-muted-foreground">ERP · النقل البري</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ms-auto text-muted-foreground hover:bg-sidebar-accent lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <nav
          className="flex flex-1 flex-col gap-6 overflow-y-auto p-3"
          style={{ height: "calc(100dvh - 4rem)" }}
          aria-label="التنقل الرئيسي"
        >
          {visibleNavigation.map((section) => (
            <section key={section.label ?? "main"}>
              {section.label ? (
                <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition",
                          active
                            ? "bg-gradient-primary text-primary-foreground shadow-glow"
                            : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-primary",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.title}</span>
                        {item.badge ? (
                          <span className="ms-auto rounded-md border border-border px-1.5 py-0.5 text-[9px] font-semibold">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border px-4 py-3 text-[10px] text-muted-foreground">
          Ticketty Cloud <span dir="ltr">v0.2</span> · Suda Technologies
        </div>
      </aside>
    </>
  );
}
