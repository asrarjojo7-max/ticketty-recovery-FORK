"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
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
        <div className="flex min-w-0 flex-1 flex-col lg:ps-64">
          <Header user={user} onMenuClick={() => setOpen((o) => !o)} />
          <main className="flex-1 p-3 sm:p-4 lg:p-6 lg:px-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}

