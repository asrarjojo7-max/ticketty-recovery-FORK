"use client";

import { CalendarDays, Sparkles, BusFront, Gauge } from "lucide-react";
import { useSession } from "@/components/layout/session-context";
import { useDashboardStats } from "@/hooks/useDashboard";
import { KpiCard, type Tone } from "@/components/dashboard/kpi-card";
import { RevenueAreaChart, FleetDonut, FleetRow, type SeriesPoint } from "@/components/dashboard/charts";
import { DashboardSkeleton } from "@/components/ui/skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BusFront as BusIcon, TicketCheck, Activity, ClipboardList } from "lucide-react";
import { formatCurrency, relativeTime } from "@/lib/utils";
import type { KpiStat, ActivityItem, ActivityStatus } from "@/types/dashboard";

/* ── Local presentational bits ─────────────────────────────── */

function HeroBand({
  name,
  avgOccupancy,
}: {
  name: string;
  avgOccupancy: number;
}) {
  const today = new Intl.DateTimeFormat("ar-SD", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-hero p-6 text-primary-foreground shadow-elevated lg:p-8">
      <div className="bg-dot-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -start-20 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--color-primary-glow)" }}
        aria-hidden="true"
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold">
            <Sparkles className="h-3.5 w-3.5" /> مركز قيادة العمليات
          </p>
          <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
            مرحبًا {name}، كل شيء تحت السيطرة.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-7 text-white/75">
            تابع أداء الحجوزات والرحلات والإيرادات من مكان واحد، واتخذ قرارات أسرع ببيانات محدّثة.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-white/60">
            <CalendarDays className="h-4 w-4" />
            {today}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:gap-4">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <Gauge className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">
              متوسط الإشغال القادم
            </p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular">
              {avgOccupancy}%
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const activityBadge: Record<ActivityStatus, { cls: string; label: string }> = {
  completed: { cls: "bg-success/15 text-success", label: "مكتمل" },
  pending: { cls: "bg-warning/20 text-warning-foreground", label: "قيد التنفيذ" },
  failed: { cls: "bg-destructive/15 text-destructive", label: "فشل" },
};

function RecentActivity({ data }: { data: ActivityItem[] }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      {data.map((a, i) => (
        <div
          key={a.id}
          className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
        >
          <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <TicketCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {a.action} · <span className="text-muted-foreground" dir="ltr">{a.entityId}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {a.user} · {relativeTime(a.createdAt)}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${activityBadge[a.status].cls}`}
          >
            {activityBadge[a.status].label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Icon/tone wiring for KPIs ─────────────────────────────── */

import {
  Ticket,
  DollarSign,
  Bus,
  Users,
  type LucideIcon,
} from "lucide-react";

const kpiIcon: Record<string, LucideIcon> = {
  ticket: Ticket,
  dollar: DollarSign,
  bus: Bus,
  users: Users,
};

const kpiTone: Record<string, Tone> = {
  totalBookings: "primary",
  todayRevenue: "success",
  tripsToday: "accent",
  ticketsSoldToday: "warning",
};

function formatKpiValue(kpi: KpiStat): string {
  return kpi.format === "currency"
    ? formatCurrency(kpi.value)
    : kpi.value.toLocaleString("ar-EG");
}

/* ── Page ───────────────────────────────────────────────────── */

export default function DashboardPage() {
  const user = useSession();
  const { data, isLoading, isError } = useDashboardStats();

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <EmptyState
        icon={Activity}
        title="تعذّر تحميل البيانات"
        desc="حدث خطأ أثناء جلب بيانات لوحة التحكم. حاول مرة أخرى."
      />
    );
  }

  const series: SeriesPoint[] = data.revenueSeries.map((p) => ({
    label: p.date,
    value: p.revenue,
  }));

  const busTotal =
    data.busCounts.active + data.busCounts.maintenance + data.busCounts.inactive;

  return (
    <div className="space-y-6">
      <HeroBand name={user.name} avgOccupancy={data.avgOccupancy} />

      {/* KPI row */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.kpis.map((kpi) => (
          <KpiCard
            key={kpi.id}
            label={kpi.title}
            value={formatKpiValue(kpi)}
            icon={kpiIcon[kpi.icon] ?? Ticket}
            tone={kpiTone[kpi.id] ?? "primary"}
            delta={kpi.changeDirection === "neutral" ? null : kpi.change}
            spark={
              kpi.id === "todayRevenue" ? series.map((s) => s.value) : undefined
            }
            hint={kpi.period}
          />
        ))}
      </section>

      {/* Revenue + fleet readiness */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueAreaChart data={series} currency="جنيالسوداني" />
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">جاهزية الأسطول</CardTitle>
            <CardDescription>{busTotal} حافلة مسجّلة</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FleetDonut counts={data.busCounts} total={busTotal} />
            <div className="space-y-2">
              <FleetRow icon={BusIcon} label="جاهزة" value={data.busCounts.active} total={busTotal} tone="success" />
              <FleetRow icon={Activity} label="صيانة" value={data.busCounts.maintenance} total={busTotal} tone="warning" />
              <FleetRow icon={ClipboardList} label="خارج الخدمة" value={data.busCounts.inactive} total={busTotal} tone="destructive" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Upcoming trips + recent activity */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">الرحلات القادمة</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">خلال ٤٨ ساعة</p>
            </div>
          </div>
          {data.upcomingTrips.length === 0 ? (
            <EmptyState
              icon={BusFront}
              title="لا توجد رحلات قادمة"
              desc="لم تُجدول أي رحلة خلال الـ٤٨ ساعة القادمة."
              ctaLabel="جدولة رحلة"
              ctaHref="/trips"
            />
          ) : (
            <div className="space-y-3">
              {data.upcomingTrips.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold" dir="rtl">
                        {t.route}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Intl.DateTimeFormat("ar-SD", {
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(t.departureAt))}
                        {t.busPlate ? ` · ${t.busPlate}` : ""}
                      </p>
                    </div>
                    <div className="text-end leading-tight">
                      <p className="tabular text-sm font-extrabold text-foreground">
                        {t.booked}/{t.capacity}
                      </p>
                      <p className="text-[10px] text-muted-foreground">مقاعد محجوزة</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-primary"
                        style={{ width: `${Math.min(100, t.occupancy)}%` }}
                      />
                    </div>
                    <span className="tabular text-[10px] font-bold text-muted-foreground">
                      {t.occupancy}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">النشاطات الأخيرة</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">آخر الحجوزات المسجّلة</p>
            </div>
          </div>
          {data.recentActivity.length === 0 ? (
            <EmptyState
              icon={TicketCheck}
              title="لا يوجد نشاط بعد"
              desc="ستظهر الحجوزات الجديدة هنا فور تسجيلها."
              ctaLabel="إنشاء حجز"
              ctaHref="/bookings"
            />
          ) : (
            <RecentActivity data={data.recentActivity} />
          )}
        </div>
      </section>
    </div>
  );
}
