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
    "منصة ERP تشغيلية لشركات النقل في السودان: الرحلات، المبيعات، التحصيل، والتقارير في نظام واحد آمن.",
};

const capabilities = [
  {
    icon: Bus,
    title: "تشغيل الأسطول",
    description:
      "جدولة الرحلات، إدارة المركبات والسائقين، ومتابعة الحضور والانطلاق لحظة بلحظة.",
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
      "لوحات تحكم تشغيلية، تسويات نقدية يومية، وتقارير أداء موثوقة بضغطة واحدة.",
  },
  {
    icon: ShieldCheck,
    title: "الأمان والصلاحيات",
    description:
      "عزل بيانات لكل منظمة وفرع، صلاحيات دقيقة لكل مستخدم، وسجل تدقيق كامل.",
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
          <Link href="/#pricing" className="ghost-link landing-nav-page">
            الأسعار
          </Link>
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

        {/* Live product mockup — the hero centerpiece */}
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
      </section>

      <section className="landing-capabilities">
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

      <section className="landing-pricing" id="pricing">
        <div className="section-head">
          <span className="eyebrow">الأسعار والاشتراكات</span>
          <h2>خطة واحدة واضحة. بلا مفاجآت.</h2>
          <p>
            كل ما تحتاجه شركة النقل لتشغيل أسطولها بالكامل — سعر واحد
            شهري بالجنيه السوداني، وتجربة مجانية كاملة أولاً.
          </p>
        </div>
        <div className="pricing-grid">
          <div className="pricing-card">
            <span className="plan-tag">تجربة مجانية</span>
            <h3 className="plan-name">شهر كامل مجاناً</h3>
            <div className="plan-price">
              <strong>0</strong>
              <span>SDG / 30 يوماً</span>
            </div>
            <p className="plan-desc">
              كل الميزات كاملة دون أي قيود — جرّب التشغيل الحقيقي
              لأسطولك قبل أي التزام مالي.
            </p>
            <ul className="plan-features">
              <li>كل شاشات التشغيل الـ 12</li>
              <li>عدد غير محدود من المستخدمين والفروع</li>
              <li>الرحلات والتذاكر والتقارير المالية</li>
              <li>دعم فني على مدار الأسبوع</li>
            </ul>
            <Link href="/login" className="ghost-link plan-cta">
              ابدأ التجربة المجانية
            </Link>
          </div>
          <div className="pricing-card pricing-featured">
            <span className="plan-tag">الخطة التشغيلية</span>
            <h3 className="plan-name">الاشتراك الشهري</h3>
            <div className="plan-price">
              <strong>199,000</strong>
              <span>SDG / شهرياً</span>
            </div>
            <p className="plan-desc">
              المنظومة كاملة لكل فريقك: مبيعات، محاسبة مزدوجة، منفستو،
              وكل التقارير — بسعر ثابت لا يتغير مع حجم عملياتك.
            </p>
            <ul className="plan-features">
              <li>كل ميزات التجربة المجانية</li>
              <li>عزل بيانات كامل بمعايير مصرفية</li>
              <li>سجل تدقيق لكل عملية</li>
              <li>نسخ احتياطي يومي مشفّر</li>
              <li>ترقيات مستمرة بلا تكلفة إضافية</li>
            </ul>
            <Link href="/login" className="primary-link plan-cta">
              اشترك الآن
            </Link>
          </div>
          <div className="pricing-card">
            <span className="plan-tag">وفر شهرين</span>
            <h3 className="plan-name">الاشتراك السنوي</h3>
            <div className="plan-price">
              <strong>2,388,000</strong>
              <span>SDG / سنوياً</span>
            </div>
            <p className="plan-desc">
              نفس الخطة الشهرية بسعر 12 شهراً بسعر 10 — وفّر 398,000 SDG سنوياً مع أولوية دعم أعلى.
            </p>
            <ul className="plan-features">
              <li>كل ميزات الخطة الشهرية</li>
              <li>شهران مجاناً (وفّر 17%)</li>
              <li>أولوية في الاستجابة والدعم</li>
              <li>مدير حساب مخصص</li>
            </ul>
            <Link href="/login" className="ghost-link plan-cta">
              اشترك سنوياً
            </Link>
          </div>
        </div>
        <p className="pricing-note">
          الأسعار بالجنيه السوداني وتشمل كل المستخدمين والفروع — لا رسوم
          خفية ولا عدّادات. التجربة المجانية 30 يوماً ثم تُحوّل تلقائياً
          بالسعر الشهري عند رغبتك.
        </p>
      </section>

      <section className="landing-cta">
        <div className="cta-panel">
          <span className="eyebrow eyebrow-light">ابدأ التشغيل اليوم</span>
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
          <div className="footer-stat">
            <strong>12</strong>
            <span>شاشة تشغيلية</span>
          </div>
          <div className="footer-stat">
            <strong>19</strong>
            <span>خدمة API</span>
          </div>
          <div className="footer-stat">
            <strong>100%</strong>
            <span>تغطية اختبارات الأمان</span>
          </div>
        </div>
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
          <span>منتج من Suda-Technologies — الخرطوم، السودان</span>
          <span className="status-dot">الأنظمة تعمل</span>
        </div>
      </footer>
    </main>
  );
}
