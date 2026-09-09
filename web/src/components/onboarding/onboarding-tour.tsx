"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bus, CircleCheckBig, ClipboardList, CreditCard, LineChart, MapPin, Ticket, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/roles";

/**
 * جولة تعريفية (Onboarding) — عربية، RTL، قصيرة، قابلة للتخطي،
 * وتختلف حسب دور المستخدم (نطاق UX-3). تظهر مرة واحدة فقط لكل دور
 * (localStorage) ويمكن إعادة تشغيلها من «قائمة المستخدم ← جولة
 * تعريفية». لا تعتمد مكتبة خارجية — طبقات ثابتة فوق الواجهة.
 */

const TOUR_KEY = "ticketty.tour.v1";

interface TourStep {
  icon: typeof Bus;
  title: string;
  body: string;
  href?: string; // انتقال للصفحة المعنية عند «التالي»
}

/** خطوات كل دور — قصيرة ومركزة على عمله الفعلي. */
const TOURS: Record<string, TourStep[]> = {
  OWNER: [
    { icon: Bus, title: "إعداد الشركة", body: "من الإعدادات: بيانات الشركة، الفروع، والمستخدمون وأدوارهم (كاشير، مدير مكتب…).", href: "/settings" },
    { icon: Bus, title: "الأسطول والمركبات", body: "أضف قوالب المقاعد (بصريًا كما الباص الحقيقي) ثم المركبات والسائقين.", href: "/buses" },
    { icon: MapPin, title: "الخطوط والرحلات", body: "أنشئ الخطوط بين المدن ثم جدول الرحلات عليها.", href: "/trips" },
    { icon: Ticket, title: "الحجوزات والتذاكر", body: "اختر الرحلة، المقعد من الخريطة، بيانات المسافر والهوية، ثم الدفع والطباعة.", href: "/bookings" },
    { icon: ClipboardList, title: "كشف الركاب", body: "قبل كل مغادرة: كشف رسمي بالركاب يُطبع ويُسلَّم للسائق.", href: "/manifests" },
    { icon: LineChart, title: "التقارير والإيرادات", body: "الأجور والإيرادات والعمولات في القسم المالي — الكشف الرسمي بلا بيانات مالية.", href: "/financial" },
  ],
  STATION_MANAGER: [
    { icon: Ticket, title: "الحجوزات اليومية", body: "تابع حجوزات مكتبك من شاشة الحجوزات: بحث، تفاصيل، وإلغاء عند الحاجة.", href: "/bookings" },
    { icon: CreditCard, title: "بيع سريع", body: "نقطة البيع: اختر الرحلة والمقعد، سجّل المسافر وهويته، واستلم النقد.", href: "/pos" },
    { icon: ClipboardList, title: "كشف الركاب", body: "اطبع كشف الركاب الرسمي للسائق قبل المغادرة.", href: "/manifests" },
    { icon: Users, title: "المسافرون", body: "سجل بيانات المسافرين المتكررين لتسريع الحجز.", href: "/customers" },
  ],
  SELLER: [
    { icon: CreditCard, title: "نقطة البيع", body: "من هنا تبيع: اختر الرحلة، ثم المقعد من الخريطة (الممر والترقيم كما في الباص).", href: "/pos" },
    { icon: Ticket, title: "بيانات المسافر", body: "لكل مقعد: الاسم، الهاتف، ورقم الهوية — مطلوبة قبل إتمام البيع.", href: "/pos" },
    { icon: CircleCheckBig, title: "بوابة الصعود", body: "امسح رمز التذكرة أو أدخل رقمها (يبدأ بـ TKT-) وسجّل صعود المسافر.", href: "/boarding" },
  ],
  OPS_MANAGER: [
    { icon: Bus, title: "الأسطول", body: "قوالب المقاعد والمركبات والسائقون — حالة كل مركبة أمامك.", href: "/buses" },
    { icon: MapPin, title: "الرحلات", body: "أنشئ وجدول الرحلات وتابع حالتها حتى المغادرة.", href: "/trips" },
    { icon: ClipboardList, title: "كشف الركاب", body: "راجع كشف الركاب واقفله قبل المغادرة.", href: "/manifests" },
  ],
  FINANCE: [
    { icon: LineChart, title: "التقارير المالية", body: "الأجور والإيرادات والعمولات والتسويات في القسم المالي.", href: "/financial" },
    { icon: CreditCard, title: "المدفوعات والمصروفات", body: "تسجيل المصروفات واعتمادها وتسويات الوكلاء.", href: "/financial" },
  ],
  AGENT: [
    { icon: Ticket, title: "حجوزاتك", body: "أنشئ حجوزات عملائك وتابع تذاكرك من شاشة الحجوزات.", href: "/bookings" },
    { icon: LineChart, title: "عمولاتك", body: "تابع عمولاتك وأرصدتك المستحقة من قسم الوكلاء.", href: "/agents" },
  ],
  VIEWER: [
    { icon: LineChart, title: "التقارير", body: "استعرض الرحلات والحجوزات والتقارير — دون تعديل أي بيانات.", href: "/trips" },
  ],
};

export function hasCompletedTour(roleKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(`${TOUR_KEY}.${roleKey}`) === "done";
  } catch {
    return true;
  }
}

export function resetTour(roleKey?: string) {
  if (typeof window === "undefined") return;
  try {
    if (roleKey) localStorage.removeItem(`${TOUR_KEY}.${roleKey}`);
    else Object.keys(localStorage).filter((k) => k.startsWith(TOUR_KEY)).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* private mode — تجاهل */
  }
}

export function OnboardingTour({ roleKey }: { roleKey: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const steps = useMemo(() => TOURS[roleKey] ?? [], [roleKey]);
  // بداية الجولة تُشتق وقت العرض (لا setState داخل effect — قاعدة الجلسة)
  const shouldStart = steps.length > 0 && !hasCompletedTour(roleKey);


  function finish() {
    try {
      localStorage.setItem(`${TOUR_KEY}.${roleKey}`, "done");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }


  function next() {
    const target = steps[step + 1];
    if (!target) return finish();
    setStep(step + 1);
    if (target.href) router.push(target.href);
  }

  const visible = open || shouldStart;
  if (!visible || steps.length === 0) return null;
  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="جولة تعريفية">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-elevated">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-primary/10 p-3 text-primary"><Icon className="h-6 w-6" /></span>
            <div>
              <p className="text-[11px] font-bold text-muted-foreground">جولة تعريفية — {roleLabel(roleKey)}</p>
              <h2 className="font-display text-lg font-bold">{step + 1} من {steps.length}: {current.title}</h2>
            </div>
          </div>
          <button onClick={finish} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="تخطي الجولة"><X className="h-4 w-4" /></button>
        </div>

        <p className="mt-4 text-sm leading-7 text-muted-foreground">{current.body}</p>

        {/* نقاط التقدم */}
        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/40" : "w-1.5 bg-border"}`} />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button onClick={finish} className="text-xs font-semibold text-muted-foreground hover:text-foreground">تخطي الكل</button>
          <div className="flex gap-2">
            {step > 0 ? <Button variant="outline" onClick={() => setStep(step - 1)}>السابق</Button> : null}
            <Button onClick={next}>
              {step + 1 === steps.length ? "ابدأ العمل" : "التالي"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
