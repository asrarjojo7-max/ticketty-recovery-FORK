import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LoginForm } from "@/app/login-form";

export const metadata: Metadata = {
  title: "بوابة الموظفين — دخول",
  description: "سجّل الدخول إلى مساحة عملك الآمنة على منظومة Ticketty.",
};

const trustPoints = [
  "صلاحيات دقيقة لكل مستخدم وفرع",
  "سجل تدقيق للعمليات الحساسة",
  "بنية جاهزة للتوسع والامتثال",
];

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-card">
          <Link href="/" className="login-back"><ArrowRight aria-hidden="true" size={16} /> العودة للرئيسية</Link>
          <div className="mobile-brand">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img
              src="/brand/logo-48.png"
              alt="شعار Ticketty"
              width={44}
              height={44}
            />
            <strong>Ticketty</strong>
          </div>

          <div className="login-heading">
            <span className="eyebrow">بوابة الموظفين</span>
            <h1>مرحباً بعودتك</h1>
            <p>أدخل بياناتك للوصول إلى مساحة العمل الآمنة.</p>
          </div>

          <LoginForm />

          <div className="security-note">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 3 5.5 5.5v5.8c0 4.2 2.7 7.9 6.5 9.7 3.8-1.8 6.5-5.5 6.5-9.7V5.5z" />
              <path d="m9.5 12 1.7 1.7 3.5-3.7" />
            </svg>
            جلسة مشفرة ومحمية. لا تشارك بيانات الدخول مع أي شخص.
          </div>
        </div>
      </section>

      <aside className="brand-panel">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img
            src="/brand/logo-48.png"
            alt="شعار Ticketty"
            className="brand-logo"
            width={48}
            height={48}
          />
          <div>
            <strong>Ticketty</strong>
            <small>Transport Operating System</small>
          </div>
        </div>

        {/* large watermark logo on the brand panel */}
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative watermark */}
        <img
          src="/brand/mark-white.png"
          alt=""
          className="panel-watermark"
        />

        <div className="brand-message">
          <span className="eyebrow eyebrow-light">إدارة النقل، بثقة</span>
          <h2>
            منصة واحدة.
            <br /> رؤية تشغيلية كاملة.
          </h2>
          <p>
            شغّل الرحلات، أدِر الحجوزات، وراقب الأداء المالي من منظومة صُممت
            لشركات النقل في السودان.
          </p>

          <ul className="trust-list">
            {trustPoints.map((point) => (
              <li key={point}>
                <span aria-hidden="true">✓</span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel-footer">
          <span>منتج من Suda-Technologies</span>
          <span className="status-dot">الأنظمة تعمل</span>
        </div>
      </aside>
    </main>
  );
}
