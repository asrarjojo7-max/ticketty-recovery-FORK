"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(data.message ?? "تعذر تسجيل الدخول");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخدمة. تحقق من الشبكة وحاول مجدداً.");
    } finally {
      setPending(false);
    }
  }

  return (
    // SECURITY: method="POST" is a structural guarantee. Even if JS fails to
    // load/attach (hydration failure, CSP, extension interference), the
    // browser can only submit via POST — credentials can never leak into a
    // URL through the native GET fallback. action="/api/session" is a
    // progressive-enhancement path: JS (handleSubmit) handles the normal
    // flow; without JS the form posts to the BFF which sets the session
    // cookie and redirects server-side.
    <form
      className="login-form"
      method="POST"
      action="/api/session"
      onSubmit={handleSubmit}
    >
      <div className="field">
        <label htmlFor="email">البريد الإلكتروني</label>
        <div className="input-wrap">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 6.5h16v11H4zM4.5 7l7.5 6 7.5-6" />
          </svg>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="name@company.com"
            dir="ltr"
            required
          />
        </div>
      </div>

      <div className="field">
        <div className="label-row">
          <label htmlFor="password">كلمة المرور</label>
          <span>8 أحرف على الأقل</span>
        </div>
        <div className="input-wrap">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            dir="ltr"
            minLength={8}
            required
          />
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? <span className="spinner" aria-hidden="true" /> : null}
        {pending ? "جارٍ التحقق..." : "تسجيل الدخول"}
        {!pending ? <span aria-hidden="true">←</span> : null}
      </button>
    </form>
  );
}
