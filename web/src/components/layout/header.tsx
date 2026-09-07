"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, CalendarDays, LogOut, Menu, Moon, Plus, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { navigation } from "@/config/navigation";
import type { SessionUser } from "@/types";

interface HeaderProps {
  user: SessionUser;
  onMenuClick: () => void;
}

const roleLabels: Record<string, string> = {
  OWNER: "مالك النظام",
  OPS_MANAGER: "مدير العمليات",
  FINANCE: "الإدارة المالية",
  STATION_MANAGER: "مدير المحطة",
  SELLER: "موظف مبيعات",
  AGENT: "وكيل",
  VIEWER: "مراجع",
};

export function Header({ user, onMenuClick }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const currentItem = navigation.flatMap((section) => section.items).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const today = new Intl.DateTimeFormat("ar-SD", { day: "numeric", month: "short" }).format(new Date());

  async function handleLogout() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-[4.75rem] items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8 xl:px-10">
      <Button variant="outline" size="icon" onClick={onMenuClick} className="lg:hidden" aria-label="فتح القائمة">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Ticketty</span><span className="opacity-40">/</span><span>مساحة التشغيل</span>
        </div>
        <p className="mt-0.5 truncate font-display text-base font-semibold text-foreground">{currentItem?.title ?? "لوحة التشغيل"}</p>
      </div>

      <div className="hidden items-center gap-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground xl:flex">
        <CalendarDays className="h-4 w-4 text-primary" />
        <span>{today}</span>
      </div>

      <Button asChild className="hidden md:inline-flex">
        <Link href="/bookings"><Plus /> حجز جديد</Link>
      </Button>

      <div className="mx-1 hidden h-7 w-px bg-border sm:block" />

      <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="تبديل المظهر" className="relative rounded-xl">
        <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>

      <Button variant="ghost" size="icon" className="relative rounded-xl" aria-label="الإشعارات">
        <Bell className="h-5 w-5" />
        <span className="absolute left-2 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 rounded-xl p-1.5 text-start transition-colors hover:bg-muted" aria-label="قائمة المستخدم">
            <Avatar className="h-9 w-9 ring-2 ring-primary/10">
              <AvatarFallback className="bg-gradient-to-br from-primary to-teal-600 font-bold text-primary-foreground">{user.name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 leading-tight lg:block">
              <p className="max-w-32 truncate text-sm font-semibold">{user.name}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{roleLabels[user.roleKey] ?? user.roleKey}</p>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-xl p-2 shadow-xl">
          <DropdownMenuLabel className="p-2.5">
            <p className="text-sm font-semibold">{user.name}</p>
            <p className="mt-1 truncate text-xs font-normal text-muted-foreground" dir="ltr">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="rounded-lg py-2.5"><User /> الملف الشخصي</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="rounded-lg py-2.5 text-destructive focus:text-destructive" onSelect={handleLogout}><LogOut /> تسجيل الخروج</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
