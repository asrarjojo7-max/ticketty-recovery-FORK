import Link from "next/link";
import type { Metadata } from "next";
import { UsersRound } from "lucide-react";

export const metadata: Metadata = {
  title: "من نحن — Ticketty by Suda-Technologies",
  description:
    "قصة Suda-Technologies وفريقها الذي يبني منظومة تشغيل شركات النقل السودانية بمعايير عالمية.",
};

export default function AboutPage() {
  return (
    <main className="landing-page legal-page">
      <header className="landing-header">
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
        <nav className="landing-nav">
          <Link href="/" className="ghost-link">
            العودة للرئيسية
          </Link>
          <Link href="/login" className="primary-link">
            دخول الموظفين
          </Link>
        </nav>
      </header>

      <section className="legal-hero">
        <span className="eyebrow">
          <UsersRound aria-hidden="true" className="eyebrow-icon" />
          فريق العمل
        </span>
        <h1>من نحن</h1>
        <p className="legal-meta">
          Suda-Technologies — شركة سودانية تقنية من الخرطوم تبني منظومات
          تشغيلية عالية الجودة لقطاع النقل البري السوداني.
        </p>
      </section>

      <article className="legal-body">
        <section className="legal-section">
          <h2>رسالتنا</h2>
          <p>
            نحوّل إدارة شركات النقل السودانية من الدفاتر والورق إلى منظومة
            رقمية واحدة موثوقة: من جدولة الرحلة إلى التذكرة المطبوعة، ومن
            التحصيل النقدي إلى القيد المحاسبي المزدوج — كل ذلك بمعايير أمان
            مصرفية وواجهات عربية مصممة لبيئة العمل اليومية الحقيقية.
          </p>
        </section>

        <section className="legal-section">
          <h2>لماذا Ticketty؟</h2>
          <p>
            بُنيت المنظومة من الصفر مع مشغّلي حافلات حقيقيين: نقاط بيع تعمل
            في ثوانٍ، منفستو رحلات جاهز للطبع قبل الانطلاق، بوابة صعود
            بباركود تمنع التذاكر المزوّرة، وتسويات نقدية يومية تحمي أموال
            الشركة. كل شركة تعمل في مساحة معزولة تماماً — بياناتك لك وحدك.
          </p>
        </section>

        <section className="legal-section">
          <h2>هندستنا</h2>
          <p>
            لا نبيع وعوداً تقنية — نبيع منظومة مُختبرة: كل ميزة تمر ببوابات
            جودة صارمة (اختبارات وحدة وتكامل وأداء على قاعدة بيانات حقيقية)
            قبل وصولها لعملائنا، مع سجل تدقيق كامل لكل عملية حساسة ونسخ
            احتياطي يومي مشفّر لبياناتك.
          </p>
        </section>

        <section className="legal-section">
          <h2>تواصل معنا</h2>
          <p>
            لتفعيل حساب شركتك أو لأي استفسار تجاري أو فني، تواصل مع فريق
            Suda-Technologies مباشرة عبر القنوات المسجّلة في الخرطوم —
            ونرحب بزيارتك لتجربة المنظومة على بياناتك الحقيقية خلال فترة
            التجربة المجانية.
          </p>
        </section>
      </article>

      <footer className="landing-footer">
        <div className="footer-links">
          <Link href="/privacy" className="footer-legal-link">
            سياسة الخصوصية
          </Link>
          <span className="footer-dot" aria-hidden="true">·</span>
          <Link href="/terms" className="footer-legal-link">
            شروط الاستخدام
          </Link>
        </div>
        <div className="footer-note">
          <span>منتج من Suda-Technologies — الخرطوم، السودان</span>
          <span className="status-dot">الأنظمة تعمل</span>
        </div>
      </footer>
    </main>
  );
}
