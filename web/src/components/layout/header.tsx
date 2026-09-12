"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { CalendarDays, Compass, LogOut, Menu, Moon, Plus, Sun, User } from "lucide-react";
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
import type { SessionUser } from "@/types";
import { roleLabel } from "@/lib/roles";
import { resetTour } from "@/components/onboarding/onboarding-tour";

interface HeaderProps {
  user: SessionUser;
  onMenuClick: () => void;
}

/**
 * ticket-master DNA topbar: sticky, translucent backdrop-blur, compact
 * contextual title, quick action, theme toggle, user dropdown.
 */
export function Header({ user, onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const today = new Intl.DateTimeFormat("ar-SD", {
    day: "numeric",
    month: "short",
  }).format(new Date());

  async function handleLogout() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl sm:px-5 lg:px-6">
      <div className="mx-auto flex h-full w-full max-w-[90rem] items-center gap-2 sm:gap-3">
      <Button
        variant="outline"
        size="icon"
        onClick={onMenuClick}
        className="lg:hidden"
        aria-label="فتح القائمة"
      >
        <Menu className="h-4 w-4" />
      </Button>

      <div className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground md:flex">
        <CalendarDays className="h-4 w-4 text-primary" />
        <span>{today}</span>
      </div>

      <div className="ms-auto flex items-center gap-2">
        <Button
          asChild
          size="icon"
          className="h-11 w-11 md:h-10 md:w-auto md:px-4"
        >
          <Link href="/bookings" aria-label="حجز جديد">
            <Plus />
            <span className="hidden md:inline">حجز جديد</span>
          </Link>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="تبديل المظهر"
          className="relative rounded-xl"
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2.5 rounded-xl p-1.5 text-start transition-colors hover:bg-muted"
              aria-label="قائمة المستخدم"
            >
              <Avatar className="h-9 w-9 ring-2 ring-primary/15">
                <AvatarFallback className="bg-gradient-primary font-bold text-primary-foreground">
                  {user.name.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden min-w-0 leading-tight lg:block">
                <p className="max-w-32 truncate text-sm font-semibold">{user.name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {roleLabel(user.roleKey)}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 rounded-xl p-2 shadow-elevated">
            <DropdownMenuLabel className="p-2.5">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="mt-1 truncate text-xs font-normal text-muted-foreground" dir="ltr">
                {user.email}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="rounded-lg py-2.5"
              onSelect={() => router.push("/profile")}
            >
              <User /> الملف الشخصي
            </DropdownMenuItem>
            <DropdownMenuItem
              className="rounded-lg py-2.5"
              onSelect={() => {
                resetTour();
                router.push("/dashboard");
                router.refresh();
              }}
            >
              <Compass /> إعادة الجولة التعريفية
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="rounded-lg py-2.5 text-destructive focus:text-destructive"
              onSelect={handleLogout}
            >
              <LogOut /> تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </header>
  );
}
