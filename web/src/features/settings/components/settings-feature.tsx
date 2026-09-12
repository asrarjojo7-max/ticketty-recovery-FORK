"use client";
/* eslint-disable @next/next/no-img-element -- authenticated tenant assets cannot use the Next image optimizer */
import { useState, type FormEvent, type ReactNode } from "react";
import {
  Building2,
  ImageIcon,
  Loader2,
  MapPin,
  Palette,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBranches,
  useCreateBranch,
  useCreateUser,
  useDeleteTicketBrandAsset,
  useOrganization,
  useRoles,
  useUpdateOrganization,
  useUpdateTicketBranding,
  useUpdateUser,
  useUploadTicketBrandAsset,
  useUsers,
} from "../hooks/use-settings";
import { ROLE_DESCRIPTIONS, roleLabel } from "@/lib/roles";
import { permissionLabel } from "@/lib/permission-labels";
import type { OrganizationSettings } from "../types";
const selectClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3 text-base md:h-10 md:text-sm";
export function SettingsFeature() {
  const org = useOrganization(),
    branches = useBranches(),
    roles = useRoles(),
    users = useUsers();
  const [userModal, setUserModal] = useState(false),
    [branchModal, setBranchModal] = useState(false);
  const updateUser = useUpdateUser();
  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <PageHeader
        eyebrow="إدارة المنصة"
        title="الإعدادات والصلاحيات"
        subtitle="بيانات الشركة والفروع والمستخدمون وسياسات التشغيل."
        icon={Building2}
      />
      <Tabs defaultValue="company" dir="rtl">
        <TabsList>
          <TabsTrigger value="company">الشركة والسياسات</TabsTrigger>
          <TabsTrigger value="users">المستخدمون</TabsTrigger>
          <TabsTrigger value="branches">الفروع</TabsTrigger>
          <TabsTrigger value="roles">الأدوار</TabsTrigger>
        </TabsList>
        <TabsContent value="company" className="mt-5">
          {org.isLoading ? (
            <Skeleton className="h-96" />
          ) : org.data ? (
            <OrganizationForm organization={org.data} />
          ) : null}
        </TabsContent>
        <TabsContent value="users" className="mt-5">
          <Card className="overflow-hidden">
            <CardHeader className="flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
              <CardTitle className="font-display text-lg">المستخدمون</CardTitle>
              <Button
                className="w-full sm:w-auto"
                onClick={() => setUserModal(true)}
              >
                <Plus />
                مستخدم جديد
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {users.isLoading ? (
                <Skeleton className="m-5 h-64" />
              ) : (
                <>
                  <div className="space-y-3 p-4 md:hidden">
                    {users.data?.map((u) => (
                      <article
                        key={u.id}
                        className="rounded-2xl border border-border bg-card p-4 shadow-card"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-bold">
                              {u.name}
                            </h3>
                            <p
                              className="mt-1 truncate text-sm text-muted-foreground"
                              dir="ltr"
                            >
                              {u.email}
                            </p>
                          </div>
                          <Badge variant={u.active ? "success" : "secondary"}>
                            {u.active ? "نشط" : "معطل"}
                          </Badge>
                        </div>
                        <dl className="mt-3 grid min-w-0 grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm [&>div]:min-w-0 [&_dd]:break-words">
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              الدور
                            </dt>
                            <dd className="mt-0.5 font-semibold">
                              {roleLabel(u.role.key)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">
                              الفرع
                            </dt>
                            <dd className="mt-0.5 font-semibold">
                              {u.branch?.name ?? "كل الفروع"}
                            </dd>
                          </div>
                        </dl>
                        <Button
                          className="mt-3 w-full"
                          variant="outline"
                          onClick={() =>
                            updateUser.mutate({
                              id: u.id,
                              input: { active: !u.active },
                            })
                          }
                        >
                          {u.active ? "تعطيل المستخدم" : "تفعيل المستخدم"}
                        </Button>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>المستخدم</TableHead>
                          <TableHead>الدور</TableHead>
                          <TableHead>الفرع</TableHead>
                          <TableHead>الحالة</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.data?.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell>
                              <p className="font-semibold">{u.name}</p>
                              <p
                                className="text-xs text-muted-foreground"
                                dir="ltr"
                              >
                                {u.email}
                              </p>
                            </TableCell>
                            <TableCell>{roleLabel(u.role.key)}</TableCell>
                            <TableCell>
                              {u.branch?.name ?? "كل الفروع"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={u.active ? "success" : "secondary"}
                              >
                                {u.active ? "نشط" : "معطل"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  updateUser.mutate({
                                    id: u.id,
                                    input: { active: !u.active },
                                  })
                                }
                              >
                                {u.active ? "تعطيل" : "تفعيل"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="branches" className="mt-5">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setBranchModal(true)}>
              <Plus />
              فرع جديد
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {branches.data?.map((b) => (
              <Card key={b.id}>
                <CardContent className="p-5">
                  <MapPin className="h-6 w-6 text-primary" />
                  <h2 className="mt-3 font-display font-semibold">{b.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {b.city} · {b.phone ?? "لا يوجد هاتف"}
                  </p>
                  <p className="mt-4 text-xs">
                    {b._count.users} مستخدم · {b._count.trips} رحلة
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="roles" className="mt-5">
          {roles.data?.length ? (
            <>
              <p className="mb-3 text-xs leading-5 text-muted-foreground">
                الأدوار الجاهزة للشركة — لكل دور صلاحيات محددة تناسب عمله. تُدار
                مستخدمات الشركة من تبويب «المستخدمون».
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {roles.data.map((r) => (
                  <Card key={r.id}>
                    <CardContent className="p-5">
                      <div className="flex justify-between">
                        <ShieldCheck className="text-primary" />
                        <Badge variant="secondary">
                          {r._count.users} مستخدم
                        </Badge>
                      </div>
                      <h2 className="mt-3 font-display font-semibold">
                        {roleLabel(r.key)}
                      </h2>
                      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                        {ROLE_DESCRIPTIONS[r.key] ?? ""}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-1">
                        {r.permissions.map((p) => (
                          <Badge key={p} variant="outline">
                            {permissionLabel(p)}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              title="لا توجد أدوار"
              description="الأدوار تُنشأ تلقائيًا مع الشركة."
            />
          )}
        </TabsContent>
      </Tabs>
      {userModal ? (
        <UserModal
          roles={roles.data ?? []}
          branches={branches.data ?? []}
          onClose={() => setUserModal(false)}
        />
      ) : null}
      {branchModal ? (
        <BranchModal onClose={() => setBranchModal(false)} />
      ) : null}
    </div>
  );
}
function OrganizationForm({
  organization,
}: {
  organization: OrganizationSettings;
}) {
  const companyMutation = useUpdateOrganization();
  const brandingMutation = useUpdateTicketBranding();
  const uploadMutation = useUploadTicketBrandAsset();
  const deleteMutation = useDeleteTicketBrandAsset();
  const [company, setCompany] = useState({
    name: organization.name,
    phone: organization.phone ?? "",
    address: organization.address ?? "",
    ticketTerms: organization.ticketTerms ?? "",
    cancellationFeePercent: organization.cancellationFeePercent,
  });
  const [branding, setBranding] = useState({
    tagline: organization.ticketBranding.tagline ?? "",
    primaryColor: organization.ticketBranding.primaryColor,
    secondaryColor: organization.ticketBranding.secondaryColor,
    checkInMinutes: String(organization.ticketBranding.checkInMinutes),
    baggagePieces: String(organization.ticketBranding.baggagePieces),
  });
  function submitCompany(e: FormEvent) {
    e.preventDefault();
    companyMutation.mutate({
      name: company.name,
      phone: company.phone,
      address: company.address,
      ticketTerms: company.ticketTerms,
      cancellationFeePercent: Number(company.cancellationFeePercent),
    });
  }
  function submitBranding(e: FormEvent) {
    e.preventDefault();
    brandingMutation.mutate({
      ...branding,
      checkInMinutes: Number(branding.checkInMinutes),
      baggagePieces: Number(branding.baggagePieces),
    });
  }
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <Building2 className="text-primary" />
            بيانات الشركة والسياسات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitCompany} className="grid gap-4 md:grid-cols-2">
            <Field label="اسم الشركة">
              <Input
                value={company.name}
                onChange={(e) =>
                  setCompany({ ...company, name: e.target.value })
                }
                required
              />
            </Field>
            <Field label="الهاتف">
              <Input
                value={company.phone}
                onChange={(e) =>
                  setCompany({ ...company, phone: e.target.value })
                }
              />
            </Field>
            <Field label="العنوان">
              <Input
                value={company.address}
                onChange={(e) =>
                  setCompany({ ...company, address: e.target.value })
                }
              />
            </Field>
            <Field label="رسوم الإلغاء %">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={company.cancellationFeePercent}
                onChange={(e) =>
                  setCompany({
                    ...company,
                    cancellationFeePercent: e.target.value,
                  })
                }
              />
            </Field>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium">
                شروط التذكرة والاسترداد
              </span>
              <textarea
                className="min-h-28 w-full rounded-xl border bg-card p-3 text-base md:text-sm"
                value={company.ticketTerms}
                onChange={(e) =>
                  setCompany({ ...company, ticketTerms: e.target.value })
                }
              />
            </label>
            <div className="md:col-span-2">
              <Button disabled={companyMutation.isPending}>
                {companyMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                حفظ بيانات الشركة
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <Palette className="text-primary" />
            هوية التذكرة المطبوعة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={submitBranding} className="grid gap-4 md:grid-cols-2">
            <Field label="العبارة الدعائية">
              <Input
                value={branding.tagline}
                maxLength={180}
                placeholder="رحلتك آمنة.. لوجهات أجمل"
                onChange={(e) =>
                  setBranding({ ...branding, tagline: e.target.value })
                }
              />
            </Field>
            <Field label="زمن الحضور قبل القيام (دقيقة)">
              <Input
                type="number"
                min="0"
                max="180"
                value={branding.checkInMinutes}
                onChange={(e) =>
                  setBranding({ ...branding, checkInMinutes: e.target.value })
                }
              />
            </Field>
            <Field label="عدد حقائب الأمتعة المسموحة">
              <Input
                type="number"
                min="0"
                max="10"
                value={branding.baggagePieces}
                onChange={(e) =>
                  setBranding({ ...branding, baggagePieces: e.target.value })
                }
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorField
                label="اللون الرئيسي"
                value={branding.primaryColor}
                onChange={(primaryColor) =>
                  setBranding({ ...branding, primaryColor })
                }
              />
              <ColorField
                label="اللون الثانوي"
                value={branding.secondaryColor}
                onChange={(secondaryColor) =>
                  setBranding({ ...branding, secondaryColor })
                }
              />
            </div>
            <div className="md:col-span-2">
              <Button disabled={brandingMutation.isPending}>
                {brandingMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Palette />
                )}
                حفظ هوية التذكرة
              </Button>
            </div>
          </form>
          <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <AssetControl
              title="شعار الشركة"
              hint="PNG / WebP / JPEG — حتى 2MB"
              url={organization.ticketBranding.logoUrl}
              busy={uploadMutation.isPending || deleteMutation.isPending}
              onUpload={(file) => uploadMutation.mutate({ kind: "logo", file })}
              onDelete={() => deleteMutation.mutate("logo")}
            />
            <AssetControl
              title="صورة الحافلة"
              hint="PNG / WebP / JPEG — حتى 8MB"
              url={organization.ticketBranding.busImageUrl}
              busy={uploadMutation.isPending || deleteMutation.isPending}
              onUpload={(file) => uploadMutation.mutate({ kind: "bus", file })}
              onDelete={() => deleteMutation.mutate("bus")}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex h-11 items-center gap-2 rounded-xl border border-input bg-card px-2 md:h-10">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-7 w-9 cursor-pointer border-0 bg-transparent"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          pattern="#[0-9A-Fa-f]{6}"
          dir="ltr"
          className="min-w-0 flex-1 bg-transparent font-mono text-base outline-none md:text-sm"
        />
      </span>
    </label>
  );
}
function AssetControl({
  title,
  hint,
  url,
  busy,
  onUpload,
  onDelete,
}: {
  title: string;
  hint: string;
  url: string | null;
  busy: boolean;
  onUpload: (file: File) => void;
  onDelete: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="mb-3 flex h-32 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-white">
        {url ? (
          <img
            src={url}
            alt={title}
            className="h-full w-full object-contain p-2"
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            لم تُرفع صورة بعد
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {hint}. تُفحص وتُحسّن وتحفظ في قاعدة البيانات.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <Upload className="h-4 w-4" />
          {url ? "استبدال" : "رفع الصورة"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.currentTarget.value = "";
            }}
          />
        </label>
        {url ? (
          <Button
            type="button"
            variant="outline"
            className="text-destructive"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 />
            حذف
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function UserModal({
  roles,
  branches,
  onClose,
}: {
  roles: import("../types").Role[];
  branches: import("../types").Branch[];
  onClose: () => void;
}) {
  const m = useCreateUser();
  const [f, setF] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    roleId: "",
    branchId: "",
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate(
      { ...f, branchId: f.branchId || undefined },
      { onSuccess: onClose },
    );
  }
  return (
    <Modal title="إضافة مستخدم" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="الاسم">
          <Input
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <Field label="البريد">
          <Input
            required
            type="email"
            dir="ltr"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
        </Field>
        <Field label="الهاتف">
          <Input
            dir="ltr"
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
        </Field>
        <Field label="كلمة المرور المؤقتة">
          <Input
            required
            type="password"
            minLength={12}
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
        </Field>
        <Field label="الدور">
          <select
            required
            className={selectClass}
            value={f.roleId}
            onChange={(e) => setF({ ...f, roleId: e.target.value })}
          >
            <option value="">اختر الدور</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {roleLabel(r.key)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الفرع">
          <select
            className={selectClass}
            value={f.branchId}
            onChange={(e) => setF({ ...f, branchId: e.target.value })}
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Submit pending={m.isPending} />
      </form>
    </Modal>
  );
}
function BranchModal({ onClose }: { onClose: () => void }) {
  const m = useCreateBranch();
  const [f, setF] = useState({ name: "", city: "", phone: "" });
  function submit(e: FormEvent) {
    e.preventDefault();
    m.mutate({ ...f, phone: f.phone || undefined }, { onSuccess: onClose });
  }
  return (
    <Modal title="إضافة فرع" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="اسم الفرع">
          <Input
            required
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </Field>
        <Field label="المدينة">
          <Input
            required
            value={f.city}
            onChange={(e) => setF({ ...f, city: e.target.value })}
          />
        </Field>
        <Field label="الهاتف">
          <Input
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
        </Field>
        <Submit pending={m.isPending} />
      </form>
    </Modal>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-4 sm:p-6">
        <div className="mb-5 flex justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
function Submit({ pending }: { pending: boolean }) {
  return (
    <Button className="w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <UserCog />}حفظ
    </Button>
  );
}
