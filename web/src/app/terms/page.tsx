import Link from "next/link";
import type { Metadata } from "next";
import { Scale } from "lucide-react";

export const metadata: Metadata = {
  title: "شروط الاستخدام — Ticketty",
  description:
    "شروط وأحكام استخدام منظومة Ticketty لإدارة شركات النقل البري بين Suda-Technologies وعملائها.",
};

const sections = [
  {
    h: "١. تعريف الخدمة",
    p: [
      "Ticketty منظومة برمجية (SaaS) لإدارة عمليات شركات النقل البري: الرحلات، مبيعات التذاكر، المحاسبة المزدوجة، والتقارير التشغيلية — تُقدَّم بالاشتراك من Suda-Technologies.",
    ],
  },
  {
    h: "٢. الاشتراك والتجربة المجانية",
    p: [
      "تحصل كل شركة جديدة على تجربة مجانية كاملة لمدة 30 يوماً بلا أي التزام. بعد التجربة، يشترك العميل في الخطة الشهرية (199,000 جنيه سوداني شهرياً) أو السنوية (2,388,000 جنيه سوداني سنوياً) — الأسعار تشمل كل المستخدمين والفروع دون حدود.",
      "ينتهي الوصول للمنظومة عند انتهاء فترة الاشتراك غير المدفوعة، مع مهلة تسوية ودّية يديرها فريق Suda-Technologies. البيانات تبقى محفوظة ومعزولة طوال فترة التسوية.",
    ],
  },
  {
    h: "٣. التزامات العميل",
    p: [
      "يلتزم العميل بإدخال بيانات تشغيله بنفسه، وبإدارة صلاحيات مستخدميه، وبعدم استخدام المنظومة في أي نشاط غير قانوني، وعدم محاولة الوصول لبيانات شركات أخرى أو اختبار حماية المنظومة دون تفويض كتابي مسبق.",
      "بيانات الركاب التي يدخلها العميل لغرض إصدار التذاكر تبقى تحت مسؤوليته التشغيلية تجاه الركاب وفق القوانين النافذة.",
    ],
  },
  {
    h: "٤. ملكية البيانات",
    p: [
      "بيانات التشغيل المدخلة ملك خالص للعميل. Suda-Technologies تعالجها بصفة معالج ثقة فقط، ولا تستخدمها لأي غرض غير تشغيل الخدمة وتحسينها بشكل مجمّع مجهول الهوية.",
      "يمكن للعميل تصدير بياناته كاملة في أي وقت، وعند إنهاء العلاقة تُسلَّم له نسخة تصديرية نهائية.",
    ],
  },
  {
    h: "٥. توفر الخدمة والدعم",
    p: [
      "نعمل على إتاحة الخدمة بجهد معقول على مدار الساعة مع نوافذ صيانة معلنة مسبقاً. الدعم الفني مت خلال ساعات العمل الرسمية بتوقيت الخرطوم، وطارئ لانقطاعات جذرية على مدار الساعة.",
    ],
  },
  {
    h: "٦. حدود المسؤولية",
    p: [
      "تُقدَّم الخدمة «كما هي» وفق أفضل ممارساتنا الهندسية. لا تتحمل Suda-Technologies أي أرباح فائتة أو خسائر غير مباشرة، وتقتصر مسؤوليتها القصوى في كل الأحوال على قيمة اشتراك آخر ثلاثة أشروٍه مدفوعة.",
    ],
  },
  {
    h: "٧. إنهاء الاشتراك",
    p: [
      "يمكن للعميل إنهاء اشتراكه في أي وقت بإشعار مسبق 15 يوماً — دون رسوم إضافية. تحتفظ Suda-Technologies بحق تعليق الوصول فوراً عند ثبوت استخدام مخالف أو عدم سداد بعد مهلة التسوية.",
    ],
  },
  {
    h: "٨. التعديلات على الشروط",
    p: [
      "قد نحدّث هذه الشروط عند تطوير الخدمة؛ يُبلَّغ العملاء بأي تعديل جوهري قبل 15 يوماً من سريانه عبر قناة التواصل المسجلة. استمرار استخدام المنظومة بعد السريان يعني القبول.",
    ],
  },
  {
    h: "٩. القانون الواجب التطبيق",
    p: [
      "تخضع هذه الشروط لقوانين جمهورية السودان، وتُحال أي منازعة لا تُحل ودياً خلال 30 يوماً إلى القضاء السوداني المختص في الخرطوم.",
    ],
  },
];

export default function TermsPage() {
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
          <Scale aria-hidden="true" className="eyebrow-icon" />
          الإطار التعاقدي
        </span>
        <h1>شروط الاستخدام</h1>
        <p className="legal-meta">
          آخر تحديث: سبتمبر 2026 — تحكم علاقة شركتك بمنظومة Ticketty
          ومنصة Suda-Technologies.
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
          <Link href="/privacy" className="footer-legal-link">
            سياسة الخصوصية
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
