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
            التحصيل النقدي إلى القيد المحاسبي المزدوج — وواجهات عربية مصممة لبيئة العمل اليومية الحقيقية.
          </p>
        </section>

        <section className="legal-section">
          <h2>لماذا Ticketty؟</h2>
          <p>
            يجمع Ticketty أدوات تشغيل النقل في نظام واحد، بما يساعد الفريق
            على متابعة الرحلات والتذاكر والعمليات المالية من واجهة موحدة.
            يمكن لفريق الشركة عرض تفاصيل الاستخدام قبل بدء التجربة.
          </p>
        </section>

        <section className="legal-section">
          <h2>هندستنا</h2>
          <p>
            نراجع جودة النظام ونعمل على حماية بيانات المؤسسات من خلال
            الصلاحيات وضوابط الوصول. يمكن لفريقنا توضيح تفاصيل الحماية
            والنسخ الاحتياطي المتاحة قبل تفعيل الحساب.
          </p>
        </section>

        <section className="legal-section" id="contact">
          <h2>تواصل معنا</h2>
          <p>
            للاستفسار عن تفعيل تجربة مجانية لمدة 30 يوماً أو عن تفاصيل
            الاشتراك، تواصل مع فريق Suda-Technologies عبر قنوات الشركة
            الرسمية قبل إعداد حسابك.
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
