"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Radio, TicketCheck } from "lucide-react";
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

export function Sidebar({ collapsed, onClose }: SidebarProps) {
  const pathname = usePathname();
  const user = useSession();
  const visibleNavigation = filterNavigation(navigation, user.permissions);

  return (
    <>
      {!collapsed ? (
        <button
          className="fixed inset-0 z-40 bg-[#071923]/65 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-label="إغلاق القائمة"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[17.5rem] flex-col overflow-hidden border-l border-white/10 bg-[#0a2635] text-white shadow-2xl shadow-slate-950/15 transition-transform duration-300 ease-out",
          collapsed ? "translate-x-full lg:translate-x-0" : "translate-x-0",
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_70%_0%,rgba(39,190,171,0.2),transparent_65%)]" />

        <div className="relative flex h-[4.75rem] items-center gap-3.5 border-b border-white/10 px-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2bc2b0] text-[#062b2a] shadow-lg shadow-teal-950/25">
            <TicketCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold tracking-tight">Ticketty</p>
            <p className="mt-0.5 text-[10px] font-medium tracking-wide text-white/50">منصة تشغيل النقل الذكية</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white/70 hover:bg-white/10 hover:text-white lg:hidden" aria-label="إغلاق القائمة">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        <nav className="relative flex-1 space-y-7 overflow-y-auto px-3 py-6" aria-label="التنقل الرئيسي">
          {visibleNavigation.map((section) => (
            <section key={section.label ?? "main"}>
              {section.label ? <p className="mb-2.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">{section.label}</p> : null}
              <div className="space-y-1.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-all",
                        active
                          ? "bg-white text-[#0a3b42] shadow-lg shadow-black/10"
                          : "text-white/65 hover:bg-white/[0.07] hover:text-white",
                      )}
                    >
                      <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg transition-colors", active ? "bg-[#ddf6f1] text-[#087f73]" : "text-white/45 group-hover:text-[#67d7c9]")}>
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="truncate">{item.title}</span>
                      {active ? <span className="mr-auto h-1.5 w-1.5 rounded-full bg-[#0f9f8f]" /> : null}
                      {item.badge ? <span className="mr-auto rounded-full bg-[#2bc2b0]/15 px-2 py-0.5 text-[10px] font-bold text-[#6ee4d6]">{item.badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="relative mx-4 mb-4 rounded-2xl border border-white/10 bg-white/[0.055] p-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-[#2bc2b0]/15 text-[#5dd9ca]">
              <Radio className="h-4 w-4" />
              <span className="absolute -left-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0a2635]" />
            </span>
            <div>
              <p className="text-xs font-semibold text-white/90">الأنظمة تعمل بكفاءة</p>
              <p className="mt-0.5 text-[10px] text-white/40">آخر مزامنة تمت الآن</p>
            </div>
          </div>
        </div>

        <div className="relative border-t border-white/10 px-5 py-3.5 text-[10px] text-white/35">
          Ticketty Cloud <span dir="ltr">v0.2</span> · Suda Technologies
        </div>
      </aside>
    </>
  );
}
