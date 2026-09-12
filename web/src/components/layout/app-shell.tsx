"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { SessionProvider } from "./session-context";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";
import type { SessionUser } from "@/types";

interface AppShellProps {
  user: SessionUser;
  children: ReactNode;
}

/**
 * App shell: RTL start-side sidebar + sticky topbar + content canvas.
 * Mobile drawer slides from the start side and closes when the pathname
 * changes (ticket-master DNA behavior) — derived via render-time key reset
 * instead of an effect to satisfy the no-setState-in-effect rule.
 */
export function AppShell({ user, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState<string | null>(null);
  const pathname = usePathname();

  // Close the mobile drawer on route change (render-time derivation).
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    if (open) setOpen(false);
  }

  return (
    <SessionProvider user={user}>
      <OnboardingTour roleKey={user.roleKey} />
      <div className="app-canvas flex min-h-screen bg-background text-foreground">
        <Sidebar collapsed={!open} onClose={() => setOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col lg:ps-60">
          <Header user={user} onMenuClick={() => setOpen((o) => !o)} />
          <main className="flex-1 p-4 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:p-5 sm:pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:p-6 lg:pb-6">
            <div className="mx-auto w-full max-w-[90rem]">{children}</div>
          </main>
        </div>
        <MobileBottomNav
          menuOpen={open}
          onMoreClick={() => setOpen(true)}
        />
      </div>
    </SessionProvider>
  );
}

