"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

interface SeatHoldTimerProps {
  expiresAt: string;
  onExpired: () => void;
  /** داخل شريط سفلي ثابت على الهاتف — بلا هوامش خارجية. */
  embedded?: boolean;
}

export function SeatHoldTimer({ expiresAt, onExpired, embedded = false }: SeatHoldTimerProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));

  useEffect(() => {
    let expired = false;
    const update = () => {
      const value = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(value);
      if (value === 0 && !expired) {
        expired = true;
        onExpired();
      }
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  const urgent = remaining < 120_000;

  return (
    <div className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm ${embedded ? "" : "mb-4"} ${urgent ? "border-amber-500/30 bg-warning/15 text-warning-foreground dark:text-amber-300" : "border-blue-500/20 bg-info/15 text-blue-700 dark:text-blue-300"}`}>
      <span className="flex items-center gap-2"><Clock3 className="h-4 w-4" />المقعد محجوز مؤقتًا</span>
      <span className="font-mono text-base font-bold" dir="ltr">{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</span>
    </div>
  );
}
