"use client";

import { useState, type FormEvent } from "react";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/components/layout/session-context";
import { hasPermission } from "@/lib/permissions";
import { useAccounts, useCreateAccount, useCreateJournal, useCreatePeriod, useEntries, useJournals, usePeriods, usePostEntry } from "./hooks";
import type { AccountType } from "./types";

export function AccountingFeature() {
  const user = useSession();
  const accounts = useAccounts();
  const periods = usePeriods();
  const journals = useJournals();
  const entries = useEntries();
  const post = usePostEntry();
  const canWrite = hasPermission(user.permissions, "accounting.write");
  const canPost = hasPermission(user.permissions, "accounting.post");

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <div>
        <p className="mb-1.5 text-xs font-bold text-primary">المحاسبة العامة</p>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">دفتر الأستاذ والقيود</h1>
        <p className="mt-2 text-sm text-muted-foreground">حسابات وفترات وقيود مزدوجة محمية من التعديل بعد الترحيل.</p>
      </div>
      {canWrite ? <SetupForms /> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="الحسابات" value={accounts.data?.length ?? 0} loading={accounts.isLoading} />
        <Metric title="دفاتر اليومية" value={journals.data?.length ?? 0} loading={journals.isLoading} />
        <Metric title="الفترات المفتوحة" value={periods.data?.filter((period) => period.status === "OPEN").length ?? 0} loading={periods.isLoading} />
      </div>
      <Card>
        <CardHeader><CardTitle>القيود المحاسبية</CardTitle></CardHeader>
        <CardContent className="p-0">
          {entries.isLoading ? <Skeleton className="m-5 h-64" /> : entries.isError ? <EmptyState icon={<BookOpen />} title="تعذر تحميل القيود" description="تحقق من الاتصال والصلاحيات ثم أعد المحاولة." /> : !entries.data?.length ? <EmptyState icon={<BookOpen />} title="لا توجد قيود" description="أنشئ أول قيد محاسبي من واجهة API الحالية." /> : <Table><TableHeader><TableRow><TableHead>الرقم</TableHead><TableHead>التاريخ</TableHead><TableHead>المصدر</TableHead><TableHead>الحالة</TableHead><TableHead>الإجراء</TableHead></TableRow></TableHeader><TableBody>{entries.data.map((entry) => <TableRow key={entry.id}><TableCell dir="ltr">{entry.entryNumber}</TableCell><TableCell>{new Date(entry.entryDate).toLocaleDateString("ar")}</TableCell><TableCell>{entry.sourceType}</TableCell><TableCell><Badge variant={entry.status === "POSTED" ? "success" : "secondary"}>{entry.status}</Badge></TableCell><TableCell>{entry.status === "DRAFT" && canPost ? <Button size="sm" disabled={post.isPending} onClick={() => post.mutate(entry.id)}>{post.isPending ? <Loader2 className="animate-spin" /> : null}ترحيل</Button> : "—"}</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent>
      </Card>
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
  return <div className="grid gap-4 lg:grid-cols-3"><Card><CardHeader><CardTitle className="text-base">حساب جديد</CardTitle></CardHeader><CardContent><form onSubmit={submitAccount} className="space-y-3"><Input aria-label="رمز الحساب" placeholder="رمز الحساب" value={account.code} onChange={(e) => setAccount({ ...account, code: e.target.value })} required/><Input aria-label="اسم الحساب" placeholder="اسم الحساب" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} required/><select aria-label="نوع الحساب" className="h-10 w-full rounded-xl border bg-card px-3" value={account.type} onChange={(e) => setAccount({ ...account, type: e.target.value as AccountType })}>{["ASSET","LIABILITY","EQUITY","REVENUE","EXPENSE"].map((type) => <option key={type}>{type}</option>)}</select><Button className="w-full" disabled={createAccount.isPending}><Plus/>إضافة</Button></form></CardContent></Card><Card><CardHeader><CardTitle className="text-base">دفتر يومية</CardTitle></CardHeader><CardContent><form onSubmit={submitJournal} className="space-y-3"><Input aria-label="رمز الدفتر" placeholder="رمز الدفتر" value={journal.code} onChange={(e) => setJournal({ ...journal, code: e.target.value })} required/><Input aria-label="اسم الدفتر" placeholder="اسم الدفتر" value={journal.name} onChange={(e) => setJournal({ ...journal, name: e.target.value })} required/><Button className="w-full" disabled={createJournal.isPending}><Plus/>إضافة</Button></form></CardContent></Card><Card><CardHeader><CardTitle className="text-base">فترة مالية</CardTitle></CardHeader><CardContent><form onSubmit={submitPeriod} className="space-y-3"><div className="grid grid-cols-2 gap-2"><Input aria-label="السنة المالية" type="number" value={period.fiscalYear} onChange={(e) => setPeriod({ ...period, fiscalYear: Number(e.target.value) })}/><Input aria-label="رقم الفترة" type="number" min="1" max="13" value={period.periodNumber} onChange={(e) => setPeriod({ ...period, periodNumber: Number(e.target.value) })}/></div><Input aria-label="بداية الفترة" type="date" value={period.startsAt} onChange={(e) => setPeriod({ ...period, startsAt: e.target.value })} required/><Input aria-label="نهاية الفترة" type="date" value={period.endsAt} onChange={(e) => setPeriod({ ...period, endsAt: e.target.value })} required/><Button className="w-full" disabled={createPeriod.isPending}><Plus/>إضافة</Button></form></CardContent></Card></div>;
}
