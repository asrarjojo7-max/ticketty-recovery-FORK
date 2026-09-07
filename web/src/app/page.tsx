import Link from "next/link";
import type { Metadata } from "next";
import {
  Ticket,
  Bus,
  ChartColumn,
  ShieldCheck,
  LogIn,
  LayoutDashboard,
  ArrowLeft,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Ticketty — منظومة إدارة شركات النقل البري",
  description:
    "منصة ERP تشغيلية لشركات النقل في السودان: الرحلات، المبيعات، التحصيل، والتقارير في نظام واحد آمن.",
};

const capabilities = [
  {
    icon: Bus,
    title: "تشغيل الأسطول",
    description:
      "جدولة الرحلات، إدارة المركبات، ومتابعة الحضور والانطلاق في الوقت الحقيقي.",
  },
  {
    icon: Ticket,
    title: "المبيعات والتذاكر",
    description:
      "نقطة بيع سريعة، إصدار تذاكر بباركود، وسياسات إرجاع واضحة لكل فرع.",
  },
  {
    icon: ChartColumn,
    title: "التقارير والمالية",
    description:
      "لوحات تحكم تشغيلية، تسويات نقدية، وتقارير أداء يومية موثوقة.",
  },
  {
    icon: ShieldCheck,
    title: "الأمان والصلاحيات",
    description:
      "عزل بيانات لكل منظمة وفرع، صلاحيات دقيقة لكل مستخدم، وسجل تدقيق كامل.",
  },
];

const stats = [
  { value: "12", label: "شاشة تشغيلية" },
  { value: "19", label: "خدمة API" },
  { value: "100%", label: "تغطية اختبارات الأمان" },
];

export default function Home() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="brand">
          <span className="brand-mark">T</span>
          <div>
            <strong>Ticketty</strong>
            <small>Transport Operating System</small>
          </div>
        </div>
        <nav className="landing-nav">
          <Link href="/login" className="ghost-link">
            دخول الموظفين
          </Link>
          <Link href="/login" className="primary-link">
            <LogIn aria-hidden="true" className="link-icon" />
            ابدأ الآن
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <span className="eyebrow">منصة إدارة شركات النقل البري</span>
        <h1>
          منظومة واحدة.
          <br />
          تشغيل كامل من الحجز حتى التقرير.
        </h1>
        <p>
          Ticketty هو نظام ERP تشغيلي لشركات النقل في السودان: الرحلات،
          المبيعات، التحصيل النقدي، والتقارير — في مكان واحد بمعايير أمان
          مصرفية.
        </p>
        <div className="hero-actions">
          <Link href="/login" className="primary-link">
            <LogIn aria-hidden="true" className="link-icon" />
            بوابة الموظفين
          </Link>
          <Link href="/login" className="ghost-link">
            <LayoutDashboard aria-hidden="true" className="link-icon" />
            استعراض النظام
          </Link>
        </div>
      </section>

      <section className="landing-capabilities">
        {capabilities.map(({ icon: Icon, title, description }) => (
          <article key={title} className="capability-card">
            <span className="capability-icon">
              <Icon aria-hidden="true" className="cap-icon" />
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <section className="landing-cta">
        <div className="cta-panel">
          <h2>جاهز لتشغيل أسطولك على Ticketty؟</h2>
          <p>
            سجّل الدخول للوصول إلى مساحة عملك، أو تواصل مع فريق Suda
            Technologies لتفعيل حساب منظمتك.
          </p>
          <Link href="/login" className="primary-link">
            <ArrowLeft aria-hidden="true" className="link-icon" />
            الدخول إلى النظام
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-stats">
          {stats.map(({ value, label }) => (
            <div key={label} className="footer-stat">
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="footer-note">
          <span>منتج من Suda-Technologies</span>
          <span className="status-dot">الأنظمة تعمل</span>
        </div>
      </footer>
    </main>
  );
}
