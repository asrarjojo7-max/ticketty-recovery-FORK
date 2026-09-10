"use client";

import { useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Copy,
  Database,
  DatabaseBackup,
  FileText,
  Globe2,
  Info,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import {
  useAcknowledgeEvent,
  useBackupRunbook,
  useEvents,
  useHealth,
  useProvisionTenant,
  useReactivateTenant,
  useRenewSubscription,
  useSetSubscription,
  useSuspendTenant,
  useTenantReport,
  useTenants,
} from "./hooks";
import type { ProvisionedTenant } from "./types";

const inputClass =
  "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";

const PLAN_LABELS: Record<string, string> = {
  TRIAL: "تجربة مجانية",
  MONTHLY: "شهري",
  YEARLY: "سنوي",
};

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "فترة تجربة",
  ACTIVE: "نشط",
  PAST_DUE: "بانتظار السداد",
  EXPIRED: "منتهي",
  CANCELLED: "ملغي",
};

function formatSdg(value: number) {
  return `${value.toLocaleString("ar-SD")} SDG`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ar-SD");
}

/**
 * لوحة مشغّل المنصة (Suda-Technologies): تزويد شركات النقل الجديدة،
 * إدارة اشتراكاتها ودورة حياتها، ومراقبة النظام لحظياً — بوابة البيع
 * والتشغيل B2B. تظهر فقط لحاملي platform.admin (الباقي يرى 403 من
 * الخادم أصلاً).
 */
export function PlatformFeature() {
  const [search, setSearch] = useState("");
  const [provisionModal, setProvisionModal] = useState(false);
  const [successResult, setSuccessResult] =
    useState<ProvisionedTenant | null>(null);

  const tenants = useTenants(search || undefined);
  const health = useHealth();

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <PageHeader
        eyebrow="منصة Suda-Technologies"
        title="إدارة المنصة والعملاء"
        subtitle="تزويد شركات النقل، إدارة الاشتراكات، ومراقبة النظام — بوابة البيع B2B."
        icon={Globe2}
      />

      {health.data ? <HealthCards data={health.data} /> : null}

      <Tabs defaultValue="tenants" dir="rtl">
        <TabsList>
          <TabsTrigger value="tenants">الشركات والاشتراكات</TabsTrigger>
          <TabsTrigger value="events">إشعارات النظام</TabsTrigger>
          <TabsTrigger value="backup">النسخ الاحتياطي</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="mt-5">
          <Card className="overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="font-display text-lg">
                شركات النقل المفعّلة
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    style={{ insetInlineStart: "0.75rem" }} />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث بالاسم أو المعرف..."
                    className={`${inputClass} w-56 ps-9`}
                  />
                </div>
                <Button onClick={() => setProvisionModal(true)}>
                  <Plus />
                  شركة جديدة
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {tenants.isLoading ? (
                <Skeleton className="m-5 h-64" />
              ) : tenants.data && tenants.data.length > 0 ? (
                <TenantsTable rows={tenants.data} />
              ) : (
                <div className="p-10">
                  <EmptyPlatform onProvision={() => setProvisionModal(true)} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-5">
          <EventsTab />
        </TabsContent>

        <TabsContent value="backup" className="mt-5">
          <BackupTab />
        </TabsContent>
      </Tabs>

      {provisionModal ? (
        <ProvisionTenantModal
          onClose={() => setProvisionModal(false)}
          onProvisioned={(result) => {
            setProvisionModal(false);
            setSuccessResult(result);
          }}
        />
      ) : null}

      {successResult ? (
        <ProvisionSuccessPanel
          result={successResult}
          onClose={() => setSuccessResult(null)}
        />
      ) : null}
    </div>
  );
}

// ── بطاقات الصحة اللحظية ──────────────────────────────────

function HealthCards({
  data,
}: {
  data: {
    tenantsTotal: number;
    tenantsActive: number;
    tenantsSuspended: number;
    trialsRunning: number;
    trialsExpiringSoon: number;
    subscriptionsActive: number;
    subscriptionsExpired: number;
    pendingAccountingEvents: number;
    unacknowledgedEvents: number;
    databaseSize: string;
  };
}) {
  const cards = [
    {
      label: "شركات نشطة",
      value: `${data.tenantsActive}/${data.tenantsTotal}`,
      hint:
        data.tenantsSuspended > 0
          ? `${data.tenantsSuspended} معلّقة`
          : "كلها تعمل",
      icon: Building2,
      tone: "text-primary",
    },
    {
      label: "اشتراكات نشطة",
      value: data.subscriptionsActive,
      hint: `${data.subscriptionsExpired} منتهية`,
      icon: ShieldCheck,
      tone: "text-primary",
    },
    {
      label: "تجارب جارية",
      value: data.trialsRunning,
      hint:
        data.trialsExpiringSoon > 0
          ? `${data.trialsExpiringSoon} تنتهي خلال أسبوع`
          : "لا تنتهي قريباً",
      icon: Activity,
      tone: data.trialsExpiringSoon > 0 ? "text-amber-600" : "text-primary",
    },
    {
      label: "أحداث غير مقروءة",
      value: data.unacknowledgedEvents,
      hint: "تنبيهات وأخطاء",
      icon: AlertTriangle,
      tone:
        data.unacknowledgedEvents > 0 ? "text-destructive" : "text-primary",
    },
    {
      label: "قيود محاسبية معلقة",
      value: data.pendingAccountingEvents,
      hint: "قيد المعالجة بالخلفية",
      icon: Database,
      tone: "text-primary",
    },
    {
      label: "حجم قاعدة البيانات",
      value: data.databaseSize,
      hint: "يُقاس لحظياً",
      icon: DatabaseBackup,
      tone: "text-primary",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {card.label}
              </span>
              <card.icon className={`h-4 w-4 ${card.tone}`} />
            </div>
            <p className="mt-2 font-display text-2xl font-bold">{card.value}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {card.hint}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── جدول الشركات مع إجراءات الدورة الحياة ─────────────────

type TenantRow = NonNullable<ReturnType<typeof useTenants>["data"]>[number];

function TenantsTable({ rows }: { rows: TenantRow[] }) {
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const suspend = useSuspendTenant();
  const reactivate = useReactivateTenant();
  const setSub = useSetSubscription();
  const renew = useRenewSubscription();

  async function handleMutation(promise: Promise<unknown>) {
    setActionError("");
    try {
      await promise;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "تعذرت العملية");
    }
  }

  return (
    <>
      {actionError ? (
        <p className="border-b border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
      <div className="overflow-x-auto"><Table>
        <TableHeader>
          <TableRow>
            <TableHead>الشركة</TableHead>
            <TableHead>الاشتراك</TableHead>
            <TableHead>الاستخدام</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead>إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((tenant) => {
            const sub = tenant.subscription;
            return (
              <TableRow key={tenant.id}>
                <TableCell>
                  <p className="font-semibold">{tenant.name}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {tenant.slug}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    منذ {formatDate(tenant.createdAt)}
                  </p>
                </TableCell>
                <TableCell>
                  {sub ? (
                    <>
                      <Badge
                        variant={sub.planKey === "TRIAL" ? "secondary" : "default"}
                      >
                        {PLAN_LABELS[sub.planKey] ?? sub.planKey}
                      </Badge>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {STATUS_LABELS[sub.status] ?? sub.status} حتى{" "}
                        {formatDate(sub.currentPeriodEnd)}
                      </p>
                    </>
                  ) : (
                    <Badge variant="outline">بلا اشتراك بعد</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  <p>
                    {tenant._count.users} مستخدم · {tenant._count.branches} فرع
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {tenant._count.trips} رحلة · {tenant._count.tickets} تذكرة
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant={tenant.active ? "success" : "secondary"}>
                    {tenant.active ? "نشطة" : "معلّقة"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setReportFor(reportFor === tenant.id ? null : tenant.id)
                      }
                    >
                      <FileText className="h-3.5 w-3.5" />
                      تقرير
                    </Button>
                    {sub?.planKey === "TRIAL" ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleMutation(
                            setSub.mutateAsync({
                              orgId: tenant.id,
                              planKey: "MONTHLY",
                            }),
                          )
                        }
                      >
                        تحويل لشهري
                      </Button>
                    ) : null}
                    {sub && sub.planKey !== "TRIAL" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleMutation(
                            renew.mutateAsync({ orgId: tenant.id, months: 1 }),
                          )
                        }
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        تجديد شهر
                      </Button>
                    ) : null}
                    {!sub ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleMutation(
                            setSub.mutateAsync({
                              orgId: tenant.id,
                              planKey: "TRIAL",
                            }),
                          )
                        }
                      >
                        بدء تجربة
                      </Button>
                    ) : null}
                    {tenant.active ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setSuspending(tenant.id)}
                      >
                        تعليق
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleMutation(reactivate.mutateAsync(tenant.id))
                        }
                      >
                        تفعيل
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table></div>

      {suspending ? (
        <SuspendDialog
          tenantName={
            rows.find((r) => r.id === suspending)?.name ?? "الشركة"
          }
          onCancel={() => setSuspending(null)}
          onConfirm={(reason) =>
            handleMutation(
              suspend
                .mutateAsync({ orgId: suspending, reason })
                .then(() => setSuspending(null)),
            )
          }
          pending={suspend.isPending}
        />
      ) : null}

      {reportFor ? <TenantReportPanel orgId={reportFor} /> : null}
    </>
  );
}

// ── حوار التعليق (سبب موثّق) ──────────────────────────────

function SuspendDialog({
  tenantName,
  onCancel,
  onConfirm,
  pending,
}: {
  tenantName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تعليق شركة"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">
              تعليق «{tenantName}»
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              يُمنع دخول مستخدميها فوراً — بياناتها محفوظة ولا تُمس.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label="إغلاق">
            <X />
          </Button>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          سبب التعليق (يوثَّق في سجل التدقيق)
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: عدم سداد الاشتراك لشهرين"
            className={inputClass}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            إلغاء
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            تعليق الشركة
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── تقرير استخدام شركة (أرقام تجارية فقط) ─────────────────

function TenantReportPanel({ orgId }: { orgId: string }) {
  const report = useTenantReport(orgId);
  if (report.isLoading) {
    return (
      <div className="border-t p-5">
        <Skeleton className="h-40" />
      </div>
    );
  }
  const data = report.data;
  if (!data) return null;

  const items = [
    { label: "الرحلات (إجمالي)", value: data.tripsTotal },
    { label: "الرحلات (آخر 30 يوماً)", value: data.tripsRecent },
    { label: "التذاكر (إجمالي)", value: data.ticketsTotal },
    { label: "التذاكر (آخر 30 يوماً)", value: data.ticketsRecent },
    { label: "المستخدمون النشطون", value: data.activeUsers },
    { label: "الفروع", value: data.branches },
    { label: "الحافلات", value: data.buses },
  ];

  return (
    <div className="border-t bg-muted/30 p-5">
      <h3 className="mb-4 font-display font-bold">
        تقرير «{data.organizationName}» — أرقام تجارية مجمّعة فقط
      </h3>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">{item.label}</p>
            <p className="mt-1 font-display text-xl font-bold">
              {item.value.toLocaleString("ar-SD")}
            </p>
          </div>
        ))}
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">
            إيراد إجمالي مسجّل
          </p>
          <p className="mt-1 font-display text-xl font-bold">
            {formatSdg(data.revenueTotalSdg)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">
            إيراد آخر 30 يوماً
          </p>
          <p className="mt-1 font-display text-xl font-bold">
            {formatSdg(data.revenueRecentSdg)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">آخر نشاط دخول</p>
          <p className="mt-1 font-display font-bold">
            {data.lastActivity ? formatDate(data.lastActivity) : "لا يوجد"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        التقرير لا يحوي أسماء عملاء أو هويات — أعداد تجارية فقط لخدمة متابعة
        الأداء وتطوير المنتج.
      </p>
    </div>
  );
}

// ── تبويب إشعارات النظام ───────────────────────────────────

function EventsTab() {
  const [level, setLevel] = useState<string | undefined>(undefined);
  const events = useEvents(level);
  const ack = useAcknowledgeEvent();

  const levels = [
    { key: undefined, label: "الكل" },
    { key: "ERROR", label: "أخطاء" },
    { key: "WARN", label: "تنبيهات" },
    { key: "INFO", label: "معلومات" },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="font-display text-lg">
          أحداث النظام وإشعاراته
        </CardTitle>
        <div className="flex gap-1.5">
          {levels.map((l) => (
            <Button
              key={l.label}
              size="sm"
              variant={level === l.key ? "default" : "outline"}
              onClick={() => setLevel(l.key)}
            >
              {l.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {events.isLoading ? (
          <Skeleton className="m-5 h-48" />
        ) : events.data && events.data.length > 0 ? (
          <div className="divide-y">
            {events.data.map((event) => (
              <div
                key={event.id}
                className="flex items-start justify-between gap-4 p-4"
              >
                <div className="flex items-start gap-3">
                  {event.level === "ERROR" ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  ) : event.level === "WARN" ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  ) : (
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  )}
                  <div>
                    <p className="text-sm font-semibold">{event.message}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {event.category} ·{" "}
                      {new Date(event.createdAt).toLocaleString("ar-SD")}
                    </p>
                  </div>
                </div>
                {event.acknowledgedAt ? (
                  <Badge variant="secondary">مُقرّ به</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => ack.mutate(event.id)}
                  >
                    إقرار
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-success" />
            <p className="font-semibold">لا أحداث حالياً</p>
            <p className="text-xs text-muted-foreground">
              النظام يعمل بسكون — ستظهر هنا التنبيهات والأخطاء فور وقوعها.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── تبويب النسخ الاحتياطي ──────────────────────────────────

function BackupTab() {
  const runbook = useBackupRunbook();
  if (runbook.isLoading) return <Skeleton className="h-48" />;
  const data = runbook.data;
  if (!data) return null;

  const steps = [
    { label: "التكرار", value: data.frequency },
    { label: "الأداة", value: data.tool },
    { label: "الاحتفاظ", value: data.retention },
    { label: "التشفير", value: data.encryption },
    { label: "تمرين الاستعادة", value: data.restoreDrill },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-lg">
          <DatabaseBackup className="h-5 w-5 text-primary" />
          دليل النسخ الاحتياطي والتشغيل
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {steps.map((step) => (
            <div key={step.label} className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{step.label}</p>
              <p className="mt-1 text-sm font-semibold">{step.value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-xs text-muted-foreground">أمر النسخ المعتمد</p>
          <code dir="ltr" className="mt-2 block font-mono text-xs">
            {data.command}
          </code>
        </div>
        <p className="text-xs text-muted-foreground">{data.note}</p>
      </CardContent>
    </Card>
  );
}

// ── حالة الفراغ ───────────────────────────────────────────

function EmptyPlatform({ onProvision }: { onProvision: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Building2 className="h-7 w-7 text-primary" />
      </div>
      <h3 className="font-display text-lg font-semibold">
        لا توجد شركات مفعّلة بعد
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        فعّل أول شركة نقل على المنصة — ستُنشأ منظمتها المعزولة ومالكها
        وفرعها الرئيسي في خطوة واحدة.
      </p>
      <Button onClick={onProvision}>
        <Plus />
        تفعيل شركة جديدة
      </Button>
    </div>
  );
}

// ── نموذج التزويد ──────────────────────────────────────────

function ProvisionTenantModal({
  onClose,
  onProvisioned,
}: {
  onClose: () => void;
  onProvisioned: (result: ProvisionedTenant) => void;
}) {
  const provision = useProvisionTenant();
  const [error, setError] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState(
    () =>
      `Tkt-${Math.random().toString(36).slice(2, 8)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result: ProvisionedTenant = await provision.mutateAsync({
        name: String(form.get("name") ?? ""),
        slug: String(form.get("slug") ?? ""),
        ownerEmail: String(form.get("ownerEmail") ?? ""),
        ownerName: String(form.get("ownerName") ?? ""),
        initialPassword: generatedPassword,
        primaryBranchName: String(form.get("branchName") ?? "") || undefined,
        primaryBranchCity: String(form.get("branchCity") ?? "") || undefined,
        organizationPhone: String(form.get("phone") ?? "") || undefined,
      });
      onProvisioned(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر التفعيل");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تفعيل شركة جديدة"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold">
                تفعيل شركة نقل جديدة
              </h2>
              <p className="text-xs text-muted-foreground">
                منظمة معزولة + مالك + فرع رئيسي في خطوة واحدة
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق">
            <X />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold">
              اسم الشركة
              <Input name="name" required maxLength={150} className={inputClass} placeholder="شركة النيل الأزرق للنقل" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              المعرف (slug)
              <Input
                name="slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="أحرف لاتينية صغيرة وأرقام وشرطة فقط"
                maxLength={40}
                className={inputClass}
                dir="ltr"
                placeholder="nile-transport"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              اسم المالك
              <Input name="ownerName" required maxLength={150} className={inputClass} placeholder="محمد أحمد" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              بريد المالك (لتسجيل الدخول)
              <Input
                name="ownerEmail"
                type="email"
                required
                maxLength={254}
                className={inputClass}
                dir="ltr"
                placeholder="owner@company.sd"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              الفرع الرئيسي (اختياري)
              <Input name="branchName" maxLength={100} className={inputClass} placeholder="الفرع الرئيسي" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              مدينة الفرع (اختياري)
              <Input name="branchCity" maxLength={100} className={inputClass} placeholder="الخرطوم" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              هاتف الشركة (اختياري)
              <Input name="phone" maxLength={30} className={inputClass} dir="ltr" placeholder="+249..." />
            </label>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" />
                كلمة المرور الأولية المؤقتة (مولّدة)
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setGeneratedPassword(
                    `Tkt-${Math.random().toString(36).slice(2, 8)}-${Math.random()
                      .toString(36)
                      .slice(2, 8)}`,
                  )
                }
              >
                توليد جديدة
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <code
                dir="ltr"
                className="flex-1 rounded-lg bg-muted px-3 py-2 font-mono text-sm"
              >
                {generatedPassword}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(generatedPassword)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              سلّمها للمالك خارج النظام — سيغيّرها عند أول دخول.
            </p>
          </div>

          {error ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={provision.isPending}>
              {provision.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
              تفعيل الشركة
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── لوحة النجاح ────────────────────────────────────────────

function ProvisionSuccessPanel({
  result,
  onClose,
}: {
  result: ProvisionedTenant;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState("");
  const rows = [
    { label: "الشركة", value: result.organization.name },
    { label: "المعرف", value: result.organization.slug, ltr: true },
    { label: "الفرع الرئيسي", value: `${result.primaryBranch.name} — ${result.primaryBranch.city}` },
    { label: "اسم المالك", value: result.owner.name },
    { label: "بريد المالك", value: result.owner.email, ltr: true },
  ];

  function copy(value: string) {
    void navigator.clipboard?.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تم تفعيل الشركة"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15">
            <CheckCircle2 className="h-6 w-6 text-success" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">
              تم تفعيل الشركة بنجاح
            </h2>
            <p className="text-xs text-muted-foreground">
              المنظمة والمالك والفرع جاهزون — سلّم بيانات الدخول للمالك الآن.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          {rows.map(({ label, value, ltr }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
            >
              <span className="text-xs text-muted-foreground">{label}</span>
              <span
                className="flex items-center gap-2 text-sm font-semibold"
                dir={ltr ? "ltr" : undefined}
              >
                {value}
                <button
                  type="button"
                  onClick={() => copy(value)}
                  className="text-muted-foreground transition-colors hover:text-primary"
                  aria-label={`نسخ ${label}`}
                >
                  {copied === value ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <UsersRound className="h-5 w-5 shrink-0 text-primary" />
          <p className="text-xs">
            المالك يسجّل الدخول من{" "}
            <strong>بوابة الموظفين</strong> بنفس بريده وكلمة المرور المؤقتة،
            ثم ينشئ فروعه ومستخدميه من شاشة الإعدادات بنفسه.
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>تم</Button>
        </div>
      </div>
    </div>
  );
}
