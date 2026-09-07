"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="logout-button" onClick={logout} disabled={pending}>
      {pending ? "جارٍ الخروج..." : "تسجيل الخروج"}
    </button>
  );
}
