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
  MapPin,
  QrCode,
  Gauge,
  CalendarClock,
  BookOpen,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Ticketty — منظومة إدارة شركات النقل البري",
  description:
    "منظومة تشغيل لشركات النقل البري في السودان لإدارة الرحلات والحجوزات والمبيعات والتحصيل والتقارير في مساحة عمل واحدة.",
};

const trialWhatsAppUrl = "https://wa.me/249906346148?text=%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85%D8%8C%20%D8%A3%D8%B1%D8%BA%D8%A8%20%D9%81%D9%8A%20%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D9%81%D8%B3%D8%A7%D8%B1%20%D8%B9%D9%86%20%D8%AA%D8%AC%D8%B1%D8%A8%D8%A9%20Ticketty%20%D8%A7%D9%84%D9%85%D8%AC%D8%A7%D9%86%D9%8A%D8%A9%20%D9%84%D9%85%D8%AF%D8%A9%2030%20%D9%8A%D9%88%D9%85%D8%A7%D9%8B.";

const capabilities = [
  {
    icon: Bus,
    title: "تشغيل الأسطول",
    description:
      "تنظيم الرحلات وإدارة بيانات المركبات والسائقين ضمن مساحة عمل واحدة.",
  },
  {
    icon: Ticket,
    title: "المبيعات والتذاكر",
    description:
      "إدارة الحجوزات والمبيعات وإصدار التذاكر وفق إجراءات الشركة.",
  },
  {
    icon: ChartColumn,
    title: "التقارير والمالية",
    description:
      "متابعة المؤشرات المالية والتشغيلية ومراجعة التقارير من مكان واحد.",
  },
  {
    icon: ShieldCheck,
    title: "الأمان والصلاحيات",
    description:
      "إدارة صلاحيات المستخدمين، مع فصل بيانات المؤسسات وسجل للعمليات الحساسة.",
  },
];

const featureRows = [
  { icon: Gauge, label: "لوحة تحكم لحظية", detail: "مبيعات اليوم وإشغال الرحلات" },
  { icon: CalendarClock, label: "جدولة الرحلات", detail: "تكرار أسبوعي وتداخل محظور" },
  { icon: QrCode, label: "تذاكر بباركود", detail: "تحقق فوري عند الصعود" },
  { icon: BookOpen, label: "قيود اليومية", detail: "قيود مزدوجة وتسوية نقدية" },
];

const mockTickets = [
  { id: "TK-2026-004821", route: "خرطوم → مدني", seats: "3", amount: "21,000" },
  { id: "TK-2026-004818", route: "بورتسودان → عطبرة", seats: "2", amount: "18,500" },
  { id: "TK-2026-004815", route: "الأبيض → الدلنج", seats: "4", amount: "26,000" },
];

export default function Home() {
  return (
    <main className="landing-page">

      <header className="landing-header">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, no optimization needed */}
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
          <Link href="/about" className="ghost-link landing-nav-page">
            من نحن
          </Link>
          <Link href="#how-it-works" className="ghost-link landing-nav-page">
            كيف تبدأ
          </Link>
          <Link href="#faq" className="ghost-link landing-nav-page">
            الأسئلة الشائعة
          </Link>
          <Link href="/login" className="ghost-link">
            دخول الموظفين
          </Link>
          <Link href={trialWhatsAppUrl} target="_blank" rel="noopener noreferrer" className="primary-link">
            استفسر عن التجربة
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <span className="hero-badge">
          <span className="badge-dot" aria-hidden="true" />
          v1.0 — المرحلة التشغيلية الأولى
        </span>
        <h1>
          منظومة واحدة.
          <br />
          <span className="hero-accent">تشغيل كامل</span> من الحجز حتى
          التقرير.
        </h1>
        <p>
          Ticketty منظومة تشغيل لشركات النقل البري تجمع إدارة الرحلات،
          والمبيعات، والتحصيل، والتقارير في مساحة عمل واحدة.
        </p>
        <div className="hero-actions">
          <Link href={trialWhatsAppUrl} target="_blank" rel="noopener noreferrer" className="primary-link">
            استفسر عن تجربة 30 يوماً
          </Link>
          <Link href="#capabilities" className="ghost-link">
            <LayoutDashboard aria-hidden="true" className="link-icon" />
            استعراض المميزات
          </Link>
          <Link href="/login" className="ghost-link employee-login-link">
            <LogIn aria-hidden="true" className="link-icon" />
            دخول الموظفين
          </Link>
        </div>

        {/* Illustrative product preview; values below are static demo content. */}
        <div className="hero-mockup" aria-hidden="true">
          <div className="mock-window">
            <div className="mock-titlebar">
              <span className="tb-dot" />
              <span className="tb-dot" />
              <span className="tb-dot" />
              <span className="tb-url">app.ticketty.sd</span>
            </div>
            <div className="mock-body">
              <aside className="mock-sidebar">
                <div className="mock-brand-row">
                  {/* eslint-disable-next-line @next/next/no-img-element -- decorative mockup */}
                  <img
                    src="/brand/mark-white.png"
                    alt=""
                    className="mock-logo-img"
                    width={26}
                    height={26}
                  />
                  <span className="mock-logo-text">Ticketty</span>
                </div>
                {["لوحة التحكم", "نقطة البيع", "الرحلات", "التذاكر", "التقارير", "الإعدادات"].map(
                  (item, i) => (
                    <div
                      key={item}
                      className={`mock-nav-item ${i === 0 ? "active" : ""}`}
                    >
                      <span className="mock-nav-icon" />
                      {item}
                    </div>
                  ),
                )}
              </aside>
              <div className="mock-content">
                <div className="mock-stats">
                  <div className="mock-stat">
                    <span className="mock-stat-label">مبيعات اليوم</span>
                    <span className="mock-stat-value">126,500</span>
                    <span className="mock-stat-delta up">+12%</span>
                  </div>
                  <div className="mock-stat">
                    <span className="mock-stat-label">تذاكر مُباعة</span>
                    <span className="mock-stat-value">48</span>
                    <span className="mock-stat-delta up">+8%</span>
                  </div>
                  <div className="mock-stat">
                    <span className="mock-stat-label">رحلات نشطة</span>
                    <span className="mock-stat-value">6</span>
                    <span className="mock-stat-delta neutral">مستقر</span>
                  </div>
                </div>
                <div className="mock-main-split">
                  <div className="mock-chart-card">
                    <div className="mock-card-head">
                      <span>إشغال الرحلات</span>
                      <span className="mock-chip">الأسبوع الحالي</span>
                    </div>
                    <div className="mock-bars">
                      {[42, 68, 55, 82, 74, 90, 63].map((h, i) => (
                        <span
                          key={i}
                          className="mock-bar"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="mock-tickets-card">
                    <div className="mock-card-head">
                      <span>أحدث التذاكر</span>
                      <MapPin className="mock-card-icon" aria-hidden="true" />
                    </div>
                    {mockTickets.map((t) => (
                      <div key={t.id} className="mock-ticket-row">
                        <span className="ticket-id">{t.id}</span>
                        <span className="ticket-route">{t.route}</span>
                        <span className="ticket-amount">{t.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p className="mockup-caption">معاينة توضيحية لواجهة Ticketty — البيانات المعروضة تجريبية وليست بيانات تشغيل مباشرة.</p>
      </section>

      <section className="landing-screenshots" aria-labelledby="screenshots-title">
        <header className="section-head">
          <span className="eyebrow">من داخل النظام</span>
          <h2 id="screenshots-title">تعرّف على واجهات Ticketty الفعلية</h2>
          <p>لقطات حقيقية من واجهة النظام، لتكوين صورة أوضح عن تجربة الاستخدام.</p>
        </header>
        <div className="screenshot-grid">
          <figure className="screenshot-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- local product screenshot */}
            <img
              src="/screenshots/ticketty-dashboard.webp"
              alt="لقطة فعلية من لوحة التحكم في Ticketty"
              loading="lazy"
              width={560}
              height={293}
            />
            <figcaption>
              <strong>لوحة التحكم</strong>
              <span>متابعة المؤشرات والانتقال إلى أقسام التشغيل من مكان واحد</span>
            </figcaption>
          </figure>
          <figure className="screenshot-card">
            {/* eslint-disable-next-line @next/next/no-img-element -- local product screenshot */}
            <img
              src="/screenshots/ticketty-login.webp"
              alt="لقطة فعلية من بوابة دخول موظفي Ticketty"
              loading="lazy"
              width={560}
              height={300}
            />
            <figcaption>
              <strong>بوابة الموظفين</strong>
              <span>واجهة تسجيل الدخول إلى مساحة عمل المؤسسة</span>
            </figcaption>
          </figure>
        </div>
        <p className="screenshots-note">اللقطات من بيئة العرض؛ وقد تختلف البيانات والمؤشرات بحسب المؤسسة وبيئة التشغيل.</p>
      </section>

      <section className="landing-capabilities" id="capabilities">
        <header className="section-head">
          <span className="eyebrow">لماذا Ticketty؟</span>
          <h2>كل ما تحتاجه شركة النقل، في منظومة واحدة</h2>
        </header>
        <div className="capability-grid">
          {capabilities.map(({ icon: Icon, title, description }) => (
            <article key={title} className="capability-card">
              <span className="capability-icon">
                <Icon aria-hidden="true" className="cap-icon" />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-features">
        <div className="features-split">
          <div className="features-copy">
            <span className="eyebrow">داخل النظام</span>
            <h2>شاشات عمل صُممت للسرعة والدقة</h2>
            <p>
              كل شاشة في Ticketty مبنية على نفس العقد التشغيلي: عرض فوري
              للحالة، إجراءات مؤكدة، وأرقام تتطابق مع القيود المالية.
            </p>
            <ul className="feature-rows">
              {featureRows.map(({ icon: Icon, label, detail }) => (
                <li key={label}>
                  <span className="feature-icon">
                    <Icon aria-hidden="true" className="feature-row-icon" />
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <span>{detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="features-visual" aria-hidden="true">
            <div className="visual-card vc-1">
              <Bus className="vc-icon" />
              <strong>الأسطول</strong>
              <span>18 مركبة • 12 خطاً</span>
            </div>
            <div className="visual-card vc-2">
              <Ticket className="vc-icon" />
              <strong>التذاكر</strong>
              <span>باركود + تحقق فوري</span>
            </div>
            <div className="visual-card vc-3">
              <ChartColumn className="vc-icon" />
              <strong>التقارير</strong>
              <span>تسويات وقيود مزدوجة</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-process" id="how-it-works" aria-labelledby="process-title">
        <header className="section-head">
          <span className="eyebrow">خطوتك الأولى</span>
          <h2 id="process-title">كيف تبدأ مع Ticketty؟</h2>
          <p>تعرّف على النظام أولاً، ثم ناقش مع الفريق طريقة التجربة المناسبة لطبيعة شركتك.</p>
        </header>
        <ol className="process-grid">
          <li className="process-card">
            <span className="process-number" aria-hidden="true">١</span>
            <h3>تواصل معنا</h3>
            <p>أرسل استفسارك عن التجربة المجانية لمدة 30 يوماً عبر واتساب.</p>
          </li>
          <li className="process-card">
            <span className="process-number" aria-hidden="true">٢</span>
            <h3>عرّفنا باحتياجك</h3>
            <p>شاركنا نبذة عن نشاط شركتك والعمليات التي تريد تنظيمها.</p>
          </li>
          <li className="process-card">
            <span className="process-number" aria-hidden="true">٣</span>
            <h3>ناقش تفاصيل التجربة</h3>
            <p>يوضح لك الفريق آلية العرض والتفعيل والخطوات المناسبة للبدء.</p>
          </li>
        </ol>
      </section>

      <section className="landing-pricing" id="pricing">
        <div className="section-head">
          <span className="eyebrow">التجربة والاشتراك</span>
          <h2>ابدأ بالتعرّف على Ticketty</h2>
          <p>
            يمكنك الاستفسار عن تفعيل تجربة مجانية لمدة 30 يوماً. تفاصيل الاشتراك
            ستُعلن بعد اعتمادها رسمياً.
          </p>
        </div>
        <div className="pricing-grid pricing-grid-single">
          <div className="pricing-card pricing-featured pricing-announcement">
            <span className="plan-tag">التسعير قيد الاعتماد</span>
            <h3 className="plan-name">الاشتراك في Ticketty</h3>
            <div className="plan-price">
              <strong>يُحدد لاحقاً</strong>
            </div>
            <p className="plan-desc">
              العملة المعتمدة للتسعير: <bdi>ج.س — جنيه سوداني (SDG)</bdi>.
              لا نعرض سعراً قبل اعتماده رسمياً.
            </p>
            <Link href={trialWhatsAppUrl} target="_blank" rel="noopener noreferrer" className="primary-link plan-cta">
              استفسر عن تجربة 30 يوماً
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-faq" id="faq" aria-labelledby="faq-title">
        <header className="section-head">
          <span className="eyebrow">إجابات واضحة</span>
          <h2 id="faq-title">الأسئلة الشائعة</h2>
          <p>معلومات أساسية قبل التواصل بشأن تجربة Ticketty.</p>
        </header>
        <div className="faq-list">
          <details className="faq-item">
            <summary>لمن صُممت Ticketty؟</summary>
            <p>للشركات العاملة في النقل البري التي تريد تنظيم الرحلات والحجوزات والمبيعات ومتابعة العمليات والتقارير في نظام واحد.</p>
          </details>
          <details className="faq-item">
            <summary>هل يمكنني تجربة النظام مجاناً؟</summary>
            <p>يمكنك التواصل للاستفسار عن تفعيل تجربة مجانية لمدة 30 يوماً، وسيشرح لك الفريق خطوات البدء.</p>
          </details>
          <details className="faq-item">
            <summary>كم تبلغ تكلفة الاشتراك؟</summary>
            <p>لم يُعتمد السعر النهائي بعد. سنعلن تفاصيل الاشتراك بعد اعتمادها رسمياً، ويمكنك التواصل للاستفسار عن المستجدات.</p>
          </details>
          <details className="faq-item">
            <summary>هل تسجيل الموظفين هو نفسه طلب التجربة؟</summary>
            <p>لا. طلب التجربة والاستفسارات يتم عبر واتساب، أما الموظفون الذين لديهم حساب بالفعل فيمكنهم استخدام رابط «دخول الموظفين».</p>
          </details>
          <details className="faq-item">
            <summary>هل الأرقام الظاهرة في معاينة الصفحة بيانات فعلية؟</summary>
            <p>لا. الأرقام داخل المعاينة التوضيحية تجريبية، ولقطات الشاشة مأخوذة من بيئة العرض وقد تختلف البيانات بحسب المؤسسة وبيئة التشغيل.</p>
          </details>
        </div>
      </section>

      <section className="landing-cta">
        <div className="cta-panel">
          <span className="eyebrow eyebrow-light">الخطوة التالية</span>
          <h2>هل تريد معرفة كيف تناسب Ticketty شركتك؟</h2>
          <p>
            هل تدير شركة نقل وتريد معرفة كيف يمكن أن تناسب Ticketty عملياتك؟
            تواصل مع فريق Suda Technologies للاستفسار عن تجربة النظام.
          </p>
          <Link href={trialWhatsAppUrl} target="_blank" rel="noopener noreferrer" className="primary-link">
            <ArrowLeft aria-hidden="true" className="link-icon" />
            تواصل بشأن التجربة
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-links">
          <Link href="/privacy" className="footer-legal-link">
            سياسة الخصوصية
          </Link>
          <span className="footer-dot" aria-hidden="true">·</span>
          <Link href="/terms" className="footer-legal-link">
            شروط الاستخدام
          </Link>
          <span className="footer-dot" aria-hidden="true">·</span>
          <Link href="/about" className="footer-legal-link">
            من نحن
          </Link>
        </div>
        <div className="footer-note">
          <span>منتج من Suda-Technologies — السودان</span>
        </div>
      </footer>
    </main>
  );
}
