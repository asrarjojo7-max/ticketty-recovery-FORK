"use client";

import { useState, type FormEvent } from "react";
import { BookOpen, Loader2, Plus, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/components/layout/session-context";
import { hasPermission } from "@/lib/permissions";
import { useAccounts, useCreateAccount, useCreateJournal, useCreatePeriod, useEntries, useEvents, useJournals, usePeriods, usePostEntry, useRequeueEvent } from "./hooks";
import type { AccountType } from "./types";

export function AccountingFeature() {
  const user = useSession();
  const accounts = useAccounts();
  const periods = usePeriods();
  const journals = useJournals();
  const entries = useEntries();
  const events = useEvents();
  const requeue = useRequeueEvent();
  const post = usePostEntry();
  const canWrite = hasPermission(user.permissions, "accounting.write");
  const canPost = hasPermission(user.permissions, "accounting.post");

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <PageHeader eyebrow="المحاسبة العامة" title="دفتر الأستاذ والقيود" subtitle="حسابات وفترات وقيود مزدوجة محمية من التعديل بعد الترحيل." icon={BookOpen} />
      {canWrite ? <SetupForms /> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="الحسابات" value={accounts.data?.length ?? 0} loading={accounts.isLoading} />
        <Metric title="دفاتر اليومية" value={journals.data?.length ?? 0} loading={journals.isLoading} />
        <Metric title="الفترات المفتوحة" value={periods.data?.filter((period) => period.status === "OPEN").length ?? 0} loading={periods.isLoading} />
      </div>
      <Card>
        <CardHeader><CardTitle>القيود المحاسبية</CardTitle></CardHeader>
        <CardContent className="p-0">
          {entries.isLoading ? <Skeleton className="m-5 h-64" /> : entries.isError ? <EmptyState icon={<BookOpen />} title="تعذر تحميل القيود" description="تحقق من الاتصال والصلاحيات ثم أعد المحاولة." /> : !entries.data?.length ? <EmptyState icon={<BookOpen />} title="لا توجد قيود" description="أنشئ أول قيد محاسبي من واجهة API الحالية." /> : <><div className="space-y-3 p-4 md:hidden">{entries.data.map((entry) => <article key={entry.id} className="rounded-2xl border border-border bg-card p-4 shadow-card"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="break-all font-mono text-sm font-bold" dir="ltr">{entry.entryNumber}</p><p className="mt-1 text-sm text-muted-foreground">{new Date(entry.entryDate).toLocaleDateString("ar")}</p></div><Badge className="max-w-full shrink-0" variant={entry.status === "POSTED" ? "success" : "secondary"}>{entry.status}</Badge></div><p className="mt-3 break-words rounded-xl bg-muted/40 p-3 text-sm"><span className="text-muted-foreground">المصدر: </span><strong>{entry.sourceType}</strong></p>{entry.status === "DRAFT" && canPost ? <Button className="mt-3 w-full" disabled={post.isPending} onClick={() => post.mutate(entry.id)}>{post.isPending ? <Loader2 className="animate-spin" /> : null}ترحيل القيد</Button> : null}</article>)}</div><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>الرقم</TableHead><TableHead>التاريخ</TableHead><TableHead>المصدر</TableHead><TableHead>الحالة</TableHead><TableHead>الإجراء</TableHead></TableRow></TableHeader><TableBody>{entries.data.map((entry) => <TableRow key={entry.id}><TableCell dir="ltr">{entry.entryNumber}</TableCell><TableCell>{new Date(entry.entryDate).toLocaleDateString("ar")}</TableCell><TableCell>{entry.sourceType}</TableCell><TableCell><Badge className="max-w-full shrink-0" variant={entry.status === "POSTED" ? "success" : "secondary"}>{entry.status}</Badge></TableCell><TableCell>{entry.status === "DRAFT" && canPost ? <Button size="sm" disabled={post.isPending} onClick={() => post.mutate(entry.id)}>{post.isPending ? <Loader2 className="animate-spin" /> : null}ترحيل</Button> : "—"}</TableCell></TableRow>)}</TableBody></Table></div></>}
        </CardContent>
      </Card>
      <EventsCard events={events} requeue={requeue} canRequeue={canPost} />
    </div>
  );
}

function Metric({ title, value, loading }: { title: string; value: number; loading: boolean }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{title}</p>{loading ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-2 text-3xl font-bold">{value}</p>}</CardContent></Card>;
}

function SetupForms() {
  const createAccount = useCreateAccount();
  const createJournal = useCreateJournal();
  const createPeriod = useCreatePeriod();
  const [account, setAccount] = useState({ code: "", name: "", type: "ASSET" as AccountType });
  const [journal, setJournal] = useState({ code: "", name: "" });
  const [period, setPeriod] = useState({ fiscalYear: new Date().getFullYear(), periodNumber: 1, startsAt: "", endsAt: "" });
  const submitAccount = (event: FormEvent) => { event.preventDefault(); createAccount.mutate(account, { onSuccess: () => setAccount({ code: "", name: "", type: "ASSET" }) }); };
  const submitJournal = (event: FormEvent) => { event.preventDefault(); createJournal.mutate(journal, { onSuccess: () => setJournal({ code: "", name: "" }) }); };
  const submitPeriod = (event: FormEvent) => { event.preventDefault(); createPeriod.mutate(period, { onSuccess: () => setPeriod({ ...period, periodNumber: period.periodNumber + 1 }) }); };
  return <div className="grid gap-4 lg:grid-cols-3"><Card><CardHeader><CardTitle className="text-base">حساب جديد</CardTitle></CardHeader><CardContent><form onSubmit={submitAccount} className="space-y-3"><Input aria-label="رمز الحساب" placeholder="رمز الحساب" value={account.code} onChange={(e) => setAccount({ ...account, code: e.target.value })} required/><Input aria-label="اسم الحساب" placeholder="اسم الحساب" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} required/><select aria-label="نوع الحساب" className="h-11 w-full rounded-xl border bg-card px-3 text-base md:h-10 md:text-sm" value={account.type} onChange={(e) => setAccount({ ...account, type: e.target.value as AccountType })}>{["ASSET","LIABILITY","EQUITY","REVENUE","EXPENSE"].map((type) => <option key={type}>{type}</option>)}</select><Button className="w-full" disabled={createAccount.isPending}><Plus/>إضافة</Button></form></CardContent></Card><Card><CardHeader><CardTitle className="text-base">دفتر يومية</CardTitle></CardHeader><CardContent><form onSubmit={submitJournal} className="space-y-3"><Input aria-label="رمز الدفتر" placeholder="رمز الدفتر" value={journal.code} onChange={(e) => setJournal({ ...journal, code: e.target.value })} required/><Input aria-label="اسم الدفتر" placeholder="اسم الدفتر" value={journal.name} onChange={(e) => setJournal({ ...journal, name: e.target.value })} required/><Button className="w-full" disabled={createJournal.isPending}><Plus/>إضافة</Button></form></CardContent></Card><Card><CardHeader><CardTitle className="text-base">فترة مالية</CardTitle></CardHeader><CardContent><form onSubmit={submitPeriod} className="space-y-3"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Input aria-label="السنة المالية" type="number" value={period.fiscalYear} onChange={(e) => setPeriod({ ...period, fiscalYear: Number(e.target.value) })}/><Input aria-label="رقم الفترة" type="number" min="1" max="13" value={period.periodNumber} onChange={(e) => setPeriod({ ...period, periodNumber: Number(e.target.value) })}/></div><Input aria-label="بداية الفترة" type="date" value={period.startsAt} onChange={(e) => setPeriod({ ...period, startsAt: e.target.value })} required/><Input aria-label="نهاية الفترة" type="date" value={period.endsAt} onChange={(e) => setPeriod({ ...period, endsAt: e.target.value })} required/><Button className="w-full" disabled={createPeriod.isPending}><Plus/>إضافة</Button></form></CardContent></Card></div>;
}

/**
 * PILOT BLOCKER-2 — رؤية أحداث المحاسبة (queue المحاسبية).
 * الفشل كان غير مرئي لأي شخص: البيع ينجح بينما القيد يفشل
 * بصمت خلف الـ worker. هذا الجدول يجعل PENDING/FAILED مرئيين
 * لأصحاب الصلاحية (accounting.read) مع إعادة محاولة رسمية
 * (accounting.post → POST /accounting/events/:id/requeue —
 * الـ endpoint موجود أصلاً؛ لا backend changes).
 * عزل المستأجرين من الطبقة نفسها: كل طلب عبر الـ BFF
 * الموثّق والـ RLS على الخادم — هذا الجدول يعرض أحداث المنظمة
 * الحالية فقط (listEvents مفروض بـ organizationId).
 */
const EVENT_TYPE_LABELS: Record<string, string> = {
  PAYMENT_RECEIVED: "استلام دفعة",
  REFUND_COMPLETED: "استرداد مكتمل",
  EXPENSE_APPROVED: "مصروف معتمد",
  AGENT_SETTLEMENT: "تسوية وكيل",
};

function EventsCard({
  events,
  requeue,
  canRequeue,
}: {
  events: ReturnType<typeof useEvents>;
  requeue: ReturnType<typeof useRequeueEvent>;
  canRequeue: boolean;
}) {
  const stuck = events.data?.filter((event) => event.status !== "POSTED") ?? [];
  const title = "أحداث المحاسبة (الطابور)";
  return (
    <Card>
      <CardHeader className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <CardTitle className="min-w-0 break-words">{title}</CardTitle>
        {stuck.length > 0 ? (
          <Badge variant="destructive">{stuck.length} غير مرحّل</Badge>
        ) : (
          <Badge variant="success">كلها مرحّلة</Badge>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {events.isLoading ? (
          <Skeleton className="m-5 h-48" />
        ) : events.isError ? (
          <EmptyState
            icon={<BookOpen />}
            title="تعذر تحميل الأحداث"
            description="تحقق من الاتصال والصلاحيات ثم أعد المحاولة."
          />
        ) : !events.data?.length ? (
          <EmptyState
            icon={<BookOpen />}
            title="لا توجد أحداث محاسبية"
            description="تُنشأ الأحداث تلقائياً مع كل عملية مالية (بيع، استرداد، مصروف، تسوية)."
          />
        ) : (
          <>
            <div className="space-y-3 p-4 md:hidden">
              {events.data.map((event) => (
                <article key={event.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="min-w-0 flex-1 break-words font-semibold">{EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}</h3>
                    <Badge className="max-w-full shrink-0" variant={event.status === "POSTED" ? "success" : event.status === "FAILED" ? "destructive" : "secondary"}>
                      {event.status === "POSTED" ? "مرحّل" : event.status === "FAILED" ? "فشل" : "بالانتظار"}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">المحاولات</dt><dd className="mt-0.5 font-semibold" dir="ltr">{event.attempts}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">القيد</dt><dd className="mt-0.5 break-all font-semibold" dir="ltr">{event.journalEntry?.entryNumber ?? "—"}</dd></div>
                    <div className="col-span-2"><dt className="text-xs text-muted-foreground">أُنشئ</dt><dd className="mt-0.5">{new Date(event.createdAt).toLocaleString("ar")}</dd></div>
                    {event.lastError ? <div className="col-span-2"><dt className="text-xs text-destructive">الخطأ</dt><dd className="mt-1 break-words text-sm text-destructive" dir="auto">{event.lastError}</dd></div> : null}
                  </dl>
                  {event.status === "FAILED" && canRequeue ? <Button className="mt-3 w-full" variant="outline" disabled={requeue.isPending} onClick={() => requeue.mutate(event.id)}><RotateCcw />إعادة المحاولة</Button> : null}
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block"><Table>
            <TableHeader>
              <TableRow>
                <TableHead>النوع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>المحاولات</TableHead>
                <TableHead>أُنشئ</TableHead>
                <TableHead>القيد</TableHead>
                <TableHead>الخطأ</TableHead>
                <TableHead>الإجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.data.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        event.status === "POSTED"
                          ? "success"
                          : event.status === "FAILED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {event.status === "POSTED"
                        ? "مرحّل"
                        : event.status === "FAILED"
                          ? "فشل"
                          : "بالانتظار"}
                    </Badge>
                  </TableCell>
                  <TableCell dir="ltr">{event.attempts}</TableCell>
                  <TableCell>
                    {new Date(event.createdAt).toLocaleString("ar")}
                  </TableCell>
                  <TableCell dir="ltr">
                    {event.journalEntry?.entryNumber ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-64">
                    {event.lastError ? (
                      <span
                        className="block truncate text-xs text-destructive"
                        title={event.lastError}
                        dir="auto"
                      >
                        {event.lastError}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {event.status === "FAILED" && canRequeue ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={requeue.isPending}
                        onClick={() => requeue.mutate(event.id)}
                        title="إعادة الطابور — سيلتقطه العامل التالي"
                      >
                        {requeue.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        إعادة المحاولة
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
