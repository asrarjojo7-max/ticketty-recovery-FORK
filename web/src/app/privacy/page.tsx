import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — Ticketty",
  description:
    "كيف تجمع منظومة Ticketty بيانات شركات النقل ومستخدميها وتحميها وتتعامل معها وفق القوانين السودانية.",
};

const sections = [
  {
    h: "١. البيانات التي نجمعها",
    p: [
      "نجمع الحد الأدنى الضروري لتشغيل الخدمة: بيانات حسابك الوظيفي (الاسم، البريد الإلكتروني، رقم الهاتف)، وبيانات التشغيل التي تدخلها شركتك (الرحلات، الحجوزات، بيانات الركاب التي تدخلها منافذ البيع لغرض إصدار التذكرة فقط)، والسجلات المالية المحاسبية.",
      "لا نجمع أي بيانات عن مستخدمي النظام من مواقع خارجية، ولا نبيع أي بيانات لأي طرف ثالث إطلاقاً.",
    ],
  },
  {
    h: "٢. الأساس القانوني للمعالجة",
    p: [
      "نعالج البيانات لتنفيذ عقد الخدمة بين Suda-Technologies وشركتك (تشغيل منظومة إدارة النقل)، وللالتزاماتنا القانونية والمحاسبية، ولحماية أمن المنظومة وكشف الاحتيال.",
    ],
  },
  {
    h: "٣. عزل البيانات بين الشركات",
    p: [
      "بيانات كل شركة (Tenant) معزولة تقنياً عن غيرها بعزل على مستوى قاعدة البيانات (Row-Level Security) — لا يمكن لأي مستخدم في شركة الوصول لبيانات شركة أخرى حتى مع خطأ برمجي افتراضي.",
      "النسخ الاحتياطية مشفرة ومخزنة في موقع منفصل، ومفاتيح التشفير لدى مشغّل المنصة وحده.",
    ],
  },
  {
    h: "٤. مدة الاحتفاظ",
    p: [
      "نحتفظ ببيانات التشغيل طوال مدة اشتراك شركتك. عند انتهاء العلاقة التجارية نهائياً، نمنح مهلة 30 يوماً لتصدير بياناتك، ثم تُحذف نهائياً خلال 90 يوماً إلا ما توجب حفظه قانوناً (كالسجلات المحاسبية للمدد النظامية).",
    ],
  },
  {
    h: "٥. حقوقك",
    p: [
      "مالك الشركة أو من يفوضه يمكنه في أي وقت: الوصول لبيانات منظمته كاملة، تصحيحها، تصديرها، أو طلب حذف حسابات المستخدمين المنتهية. للركاب المسافرين الذين تُدخل بياناتهم لمنافذ البيع: يمكنهم مراجعة بياناتهم وتصحيحها عبر شركة النقل التي اشتروا منها التذكرة.",
      "طلبات ممارسة الحقوق تُرسل عبر شركة النقل المشتركة في المنظومة، أو مباشرة عبر نموذج التواصل أدناه.",
    ],
  },
  {
    h: "٦. أمن المعالجة",
    p: [
      "التشفير أثناء النقل إلزامي (TLS)، وكلمات المرور مُهشّة بخوارزمية bcrypt مع سياسة قفل الحساب بعد المحاولات الفاشلة. كل عملية حساسة تُسجَّل في سجل تدقيق غير قابل للتعديل.",
    ],
  },
  {
    h: "٧. الجهات المساعدة في المعالجة",
    p: [
      "نستخدم مزود استضافة للبنية التحتية فقط، ولا يملك أي وصول لبيانات التشغيل. لا نستخدم أي أدوات تتبع تسويقية داخل المنظومة، ولا نشارك بيانات مع أي شبكات إعلانية.",
    ],
  },
  {
    h: "٨. التواصل والشكاوى",
    p: [
      "لأي استفسار حول الخصوصية أو للإبلاغ عن مخالفة مشتبهة: عبر شركة النقل المشتركة لدينا، أو على البريد المسجّل لدى Suda-Technologies في الخرطوم. نلتزم بالتحقيق في كل بلاغ خلال 30 يوماً والرد كتابياً.",
    ],
  },
];

export default function PrivacyPage() {
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
          <ShieldCheck aria-hidden="true" className="eyebrow-icon" />
          الخصوصية والأمان
        </span>
        <h1>سياسة الخصوصية</h1>
        <p className="legal-meta">
          آخر تحديث: سبتمبر 2026 — منسّقة مع منظومة إدارة البيانات الشخصية
          في جمهورية السودان ومع أفضل الممارسات في حماية بيانات المنشآت.
        </p>
      </section>

      <article className="legal-body">
        {sections.map((section) => (
          <section key={section.h} className="legal-section">
            <h2>{section.h}</h2>
            {section.p.map((paragraph) => (
              <p key={paragraph.slice(0, 24)}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>

      <footer className="landing-footer">
        <div className="footer-links">
          <Link href="/terms" className="footer-legal-link">
            شروط الاستخدام
          </Link>
          <span className="footer-dot" aria-hidden="true">·</span>
          <Link href="/about" className="footer-legal-link">
            من نحن
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
