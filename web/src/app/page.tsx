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
  UsersRound,
  CircleDollarSign,
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
  { id: "TKT-4821", route: "خرطوم → مدني", seats: "3", amount: "21,000" },
  { id: "TKT-4818", route: "بورتسودان → أتبرب", seats: "2", amount: "18,500" },
  { id: "TKT-4815", route: "الأبيض → الدلنج", seats: "4", amount: "26,000" },
];

export default function Home() {
  return (
    <main className="landing-page">
      {/* ambient brand orbs (solid, layered — no gradients per owner rule) */}
      <div aria-hidden="true" className="orb orb-a" />
      <div aria-hidden="true" className="orb orb-b" />

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
                  <span className="mock-logo">T</span>
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
          <div className="floating-chip chip-1">
            <CircleDollarSign className="chip-icon" aria-hidden="true" />
            <div>
              <strong>تسوية نقدية</strong>
              <span>مطابقة 100% اليوم</span>
            </div>
          </div>
          <div className="floating-chip chip-2">
            <UsersRound className="chip-icon" aria-hidden="true" />
            <div>
              <strong>إشغال الرحلة</strong>
              <span>34 / 40 مقعداً</span>
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
        <div className="footer-note">
          <span>منتج من Suda-Technologies</span>
          <span className="status-dot">الأنظمة تعمل</span>
        </div>
      </footer>
    </main>
  );
}
