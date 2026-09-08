"use client";

import { useState, type FormEvent } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  Globe2,
  Loader2,
  Plus,
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
import { PageHeader } from "@/components/layout/page-header";
import { useProvisionTenant, useTenants } from "./hooks";
import type { ProvisionedTenant } from "./types";

const inputClass =
  "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";

/**
 * لوحة مشغّل المنصة (Suda-Technologies): تزويد شركات النقل الجديدة
 * ومراقبة الـ Tenants — بوابة البيع B2B. تظهر فقط لحاملي
 * platform.admin (الباقي يرى 403 من الخادم أصلاً).
 */
export function PlatformFeature() {
  const [search, setSearch] = useState("");
  const [provisionModal, setProvisionModal] = useState(false);
  const [successResult, setSuccessResult] =
    useState<ProvisionedTenant | null>(null);

  const tenants = useTenants(search || undefined);

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <PageHeader
        eyebrow="منصة Suda-Technologies"
        title="إدارة المنصة والعملاء"
        subtitle="تزويد شركات النقل الجديدة ومراقبة الـ Tenants — بوابة البيع B2B."
        icon={Globe2}
      />

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="font-display text-lg">
            شركات النقل المفعّلة
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الشركة</TableHead>
                  <TableHead>المعرف</TableHead>
                  <TableHead>المستخدمون</TableHead>
                  <TableHead>الفروع</TableHead>
                  <TableHead>الرحلات</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>تاريخ التفعيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.data?.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <p className="font-semibold">{tenant.name}</p>
                    </TableCell>
                    <TableCell dir="ltr" className="text-xs">
                      {tenant.slug}
                    </TableCell>
                    <TableCell>{tenant._count.users}</TableCell>
                    <TableCell>{tenant._count.branches}</TableCell>
                    <TableCell>{tenant._count.trips}</TableCell>
                    <TableCell>
                      <Badge
                        variant={tenant.active ? "success" : "secondary"}
                      >
                        {tenant.active ? "نشط" : "معطل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(tenant.createdAt).toLocaleDateString("ar-SD")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-10">
              <EmptyPlatform onProvision={() => setProvisionModal(true)} />
            </div>
          )}
        </CardContent>
      </Card>

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
