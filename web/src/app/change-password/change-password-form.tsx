"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";

export function ChangePasswordForm() {
  const router = useRouter();
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (values.next !== values.confirm) {
      setError("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
      return;
    }

    setPending(true);
    try {
      await apiClient("/auth/change-password", {
        method: "POST",
        body: {
          currentPassword: values.current,
          newPassword: values.next,
        },
      });
      await fetch("/api/session", { method: "DELETE" });
      router.replace("/login?passwordChanged=1");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر تغيير كلمة المرور.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label className="grid gap-1.5 text-sm font-semibold">
        كلمة المرور المؤقتة
        <Input
          aria-label="كلمة المرور المؤقتة"
          autoComplete="current-password"
          disabled={pending}
          minLength={8}
          onChange={(event) =>
            setValues({ ...values, current: event.target.value })
          }
          required
          type="password"
          value={values.current}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        كلمة المرور الجديدة
        <Input
          aria-label="كلمة المرور الجديدة"
          autoComplete="new-password"
          disabled={pending}
          minLength={12}
          onChange={(event) =>
            setValues({ ...values, next: event.target.value })
          }
          required
          type="password"
          value={values.next}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        تأكيد كلمة المرور الجديدة
        <Input
          aria-label="تأكيد كلمة المرور الجديدة"
          autoComplete="new-password"
          disabled={pending}
          minLength={12}
          onChange={(event) =>
            setValues({ ...values, confirm: event.target.value })
          }
          required
          type="password"
          value={values.confirm}
        />
      </label>
      <p className="text-xs leading-5 text-muted-foreground">
        استخدم 12 حرفًا على الأقل. بعد الحفظ ستسجّل الدخول مرة أخرى بكلمة المرور
        الجديدة.
      </p>
      {error ? (
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button
        disabled={pending || !values.current || !values.next || !values.confirm}
        type="submit"
      >
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        {pending ? "جارٍ الحفظ..." : "حفظ كلمة المرور والمتابعة"}
      </Button>
    </form>
  );
}
