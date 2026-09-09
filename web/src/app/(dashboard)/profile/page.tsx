"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/layout/session-context";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/roles";

const inputClass = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm";

/**
 * الملف الشخصي — بيانات الحساب المناسبة فقط (لا passwordHash ولا
 * tokens ولا أسرار). تعديل كلمة المرور عبر نفس endpoint المصمم لذلك
 * (يبطل الجلسات الأقدم تلقائيًا).
 */
export default function ProfilePage() {
  const user = useSession();
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwPending, setPwPending] = useState(false);
  const [pwError, setPwError] = useState("");

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwError("");
    if (pwForm.next !== pwForm.confirm) {
      setPwError("كلمة المرور الجديدة وتأكيدها غير متطابقين.");
      return;
    }
    setPwPending(true);
    try {
      await apiClient("/auth/change-password", {
        method: "POST",
        body: { currentPassword: pwForm.current, newPassword: pwForm.next },
      });
      toast.success("تم تغيير كلمة المرور", {
        description: "سيُطلب منك تسجيل الدخول من جديد عند انتهاء الجلسة الحالية.",
      });
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "تعذر تغيير كلمة المرور.");
    } finally {
      setPwPending(false);
    }
  }

  const rows = [
    { label: "الاسم", value: user.name },
    { label: "البريد الإلكتروني", value: user.email, ltr: true },
    { label: "الدور", value: ROLE_LABELS[user.roleKey] ?? user.roleKey },
    { label: "المكتب / الفرع", value: user.branchId ? "مرتبط بفرع محدد" : "كل الفروع" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="حسابي"
        title="الملف الشخصي"
        subtitle="بيانات حسابك ودورك وصلاحياتك في النظام."
        icon={UserRound}
      />

      <Card>
        <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 font-display text-lg"><ShieldCheck className="h-5 w-5 text-primary" />بيانات الحساب</CardTitle></CardHeader>
        <CardContent className="p-5">
          <div className="grid gap-3">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <span className="flex items-center gap-2 text-sm font-semibold" dir={r.ltr ? "ltr" : undefined}>{r.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3">
              <span className="text-xs text-muted-foreground">عدد الصلاحيات</span>
              <Badge variant="secondary">{user.permissions.length} صلاحية</Badge>
            </div>
          </div>
          <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
            بيانات الدخول يديرها مدير الشركة من شاشة الإعدادات ← المستخدمون. من هنا يمكنك تغيير كلمة مرورك فقط.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 font-display text-lg"><KeyRound className="h-5 w-5 text-primary" />تغيير كلمة المرور</CardTitle></CardHeader>
        <CardContent className="p-5">
          <form onSubmit={changePassword} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold">
              كلمة المرور الحالية
              <Input type="password" required className={inputClass} value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-semibold">
                كلمة المرور الجديدة
                <Input type="password" required minLength={12} className={inputClass} value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                تأكيد كلمة المرور الجديدة
                <Input type="password" required minLength={12} className={inputClass} value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} />
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">12 حرفًا على الأقل. تغييرها يُنهي جلسات الدخول الأخرى تلقائيًا.</p>
            {pwError ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{pwError}</p> : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={pwPending || !pwForm.current || !pwForm.next}>
                {pwPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
                تغيير كلمة المرور
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
