"use client";

import { useMemo, useState } from "react";
import {
  BusFront,
  ClipboardList,
  FileCheck2,
  Lock,
  Loader2,
  Printer,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useSession } from "@/components/layout/session-context";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import { useTrips } from "@/features/trips";
import { formatTripDate } from "@/features/trips/formatters";
import {
  useGenerateManifest,
  useLockManifest,
  useManifest,
} from "../hooks/use-manifests";

/**
 * منفستو الرحلة — مستند رسمي للركاب يُطبع ويُسلَّم للسائق.
 *
 * قاعدة المنفستو (نطاق UX-8): بيانات الركاب الأساسية فقط —
 * الأجرة والإيراد والوكيل وكل المعلومات المالية الداخلية تبقى
 * داخل النظام في المالية والتقارير. الشاشة التفاعلية (بحث/أزرار)
 * لا تُطبع؛ المطبوع هو المستند الرسمي فقط (رأس + جدول + توقيع).
 */
export function ManifestsFeature() {
  const user = useSession();
  const canManage =
    user.permissions.includes("*") || user.permissions.includes("manifests.write");
  const trips = useTrips();
  const [tripId, setTripId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmLock, setConfirmLock] = useState(false);
  const manifest = useManifest(tripId);
  const generate = useGenerateManifest();
  const lock = useLockManifest();

  const tickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (
      manifest.data?.tickets.filter(
        (t) =>
          !q ||
          `${t.passengerName} ${t.passengerPhone} ${t.number} ${t.seatLabel}`
            .toLowerCase()
            .includes(q),
      ) ?? []
    );
  }, [manifest.data, search]);

  const trip = manifest.data?.trip;

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <PageHeader
        eyebrow="وثائق التشغيل"
        title="كشف الركاب / منفستو الرحلات"
        subtitle="المستند الرسمي لقائمة الركاب — يُطبع ويُسلَّم للسائق والجهات المختصة."
        icon={ClipboardList}
      />

      <Card className="no-print">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row">
          <select
            className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-base md:h-10 md:text-sm"
            value={tripId ?? ""}
            onChange={(e) => setTripId(e.target.value || null)}
            aria-label="اختر الرحلة"
          >
            <option value="">اختر الرحلة</option>
            {trips.data
              ?.filter((t) => t.status !== "CANCELLED")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.route.name} — {formatTripDate(t.departureAt)}
                </option>
              ))}
          </select>
          {tripId && canManage && !manifest.data?.manifest ? (
            <Button
              disabled={generate.isPending}
              onClick={() => generate.mutate(tripId)}
            >
              {generate.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FileCheck2 />
              )}
              إنشاء كشف الركاب
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {!tripId ? (
        <EmptyState
          icon={<FileCheck2 className="h-10 w-10" />}
          title="اختر رحلة"
          description="ستظهر قائمة الركاب الرسمية هنا — جاهزة للطباعة والتسليم للسائق."
        />
      ) : manifest.isLoading ? (
        <Skeleton className="h-96" />
      ) : manifest.data ? (
        <section className="manifest-print-area space-y-5">
          {/* شريط تحكم — تفاعلي فقط، لا يُطبع */}
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {manifest.data.manifest ? (
                <Badge
                  variant={manifest.data.manifest.lockedAt ? "secondary" : "warning"}
                >
                  {manifest.data.manifest.lockedAt
                    ? "مقفل — نهائي"
                    : `مسودة v${manifest.data.manifest.version}`}
                </Badge>
              ) : (
                <Badge variant="outline">غير مُنشأ</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {manifest.data.totals.passengers} راكب في القائمة
              </span>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Button variant="outline" className="sm:w-auto" onClick={() => window.print()}>
                <Printer /> طباعة المستند
              </Button>
              {canManage &&
              manifest.data.manifest &&
              !manifest.data.manifest.lockedAt ? (
                <Button className="sm:w-auto" onClick={() => setConfirmLock(true)}>
                  <Lock /> قفل ومغادرة
                </Button>
              ) : null}
            </div>
          </div>

          {!search ? (
            <div className="no-print relative mb-4 max-w-sm">
              <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="ps-9"
                placeholder="بحث في الركاب (للمراجعة على الشاشة — لا يظهر في المطبوع)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          ) : null}

          {/* ═══ المستند الرسمي المطبوع ═══ */}
          <div className="official-manifest rounded-2xl border-2 border-foreground/70 bg-card p-6 sm:p-8">
            <header className="border-b-2 border-foreground/70 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <BusFront className="h-10 w-10 text-foreground" />
                  <div>
                    <p className="font-display text-lg font-extrabold">
                      شركة النقل — كشف ركاب
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      وثيقة تشغيلية رسمية تُسلَّم للسائق عند المغادرة
                    </p>
                  </div>
                </div>
                <div className="text-end">
                  <h2 className="font-display text-xl font-extrabold">
                    كشف الركاب / Manifest
                  </h2>
                  <p className="mt-1 text-xs">
                    إصدار:{" "}
                    {manifest.data.manifest
                      ? new Intl.DateTimeFormat("ar-SD").format(
                          new Date(manifest.data.manifest.generatedAt),
                        )
                      : "—"}
                  </p>
                </div>
              </div>
            </header>

            <div className="grid gap-3 border-b border-foreground/20 py-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[10px] font-bold text-muted-foreground">الخط</p>
                <p className="mt-0.5 text-sm font-bold">{trip?.route.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {trip?.route.fromCity} ← {trip?.route.toCity}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground">المغادرة</p>
                <p className="mt-0.5 text-sm font-bold">
                  {trip ? formatTripDate(trip.departureAt) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground">المركبة</p>
                <p className="mt-0.5 text-sm font-bold" dir="ltr">
                  {trip?.bus.plateNumber}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground">السائق</p>
                <p className="mt-0.5 text-sm font-bold">
                  {trip?.driverName ?? "يُعيَّن عند المغادرة"}
                </p>
              </div>
            </div>

            <div className="space-y-3 py-4 md:hidden print:hidden">
              {tickets.map((t, i) => (
                <article key={t.id} className="rounded-xl border border-foreground/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">
                      <span className="text-muted-foreground">{i + 1}. </span>
                      {t.passengerName}
                    </h3>
                    <span className="font-bold" dir="ltr">{t.seatLabel}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
                    <div><dt className="text-[11px] text-muted-foreground">الهوية</dt><dd dir="ltr">{t.passengerNationalId ?? "—"}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">الهاتف</dt><dd dir="ltr">{t.passengerPhone}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">من</dt><dd>{t.boardingStop ?? "—"}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">إلى</dt><dd>{t.dropOffStop ?? "—"}</dd></div>
                  </dl>
                </article>
              ))}
              {tickets.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">لا ركاب في هذه الرحلة بعد</p>
              ) : null}
            </div>

            <div className="hidden overflow-x-auto py-4 md:block print:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-foreground/30">
                    <TableHead className="font-bold">#</TableHead>
                    <TableHead className="font-bold">الاسم الكامل</TableHead>
                    <TableHead className="font-bold">رقم الهوية</TableHead>
                    <TableHead className="font-bold">الهاتف</TableHead>
                    <TableHead className="font-bold">المقعد</TableHead>
                    <TableHead className="font-bold">من</TableHead>
                    <TableHead className="font-bold">إلى</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((t, i) => (
                    <TableRow key={t.id} className="border-foreground/15">
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-semibold">{t.passengerName}</TableCell>
                      <TableCell dir="ltr">{t.passengerNationalId ?? "—"}</TableCell>
                      <TableCell dir="ltr">{t.passengerPhone}</TableCell>
                      <TableCell className="font-bold">{t.seatLabel}</TableCell>
                      <TableCell>{t.boardingStop ?? "—"}</TableCell>
                      <TableCell>{t.dropOffStop ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {tickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                        لا ركاب في هذه الرحلة بعد
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            <p className="border-t border-foreground/20 pt-2 text-[11px] text-muted-foreground">
              عدد الركاب: {tickets.length} — تُراجع القائمة وتُقفل قبل المغادرة.
              هذا الكشف للجهات المختصة ولا يتضمن أي بيانات مالية للشركة.
            </p>

            <footer className="mt-8 grid gap-6 sm:grid-cols-3">
              <div className="border-t border-foreground pt-2 text-center text-xs font-bold">
                شركة النقل
                <span className="mt-6 block font-normal text-muted-foreground">
                  الاسم / التوقيع
                </span>
              </div>
              <div className="border-t border-foreground pt-2 text-center text-xs font-bold">
                المكتب
                <span className="mt-6 block font-normal text-muted-foreground">
                  الاسم / التوقيع
                </span>
              </div>
              <div className="border-t border-foreground pt-2 text-center text-xs font-bold">
                التوقيع والختم
                <span className="mt-6 block font-normal text-muted-foreground">
                  المكان المخصص
                </span>
              </div>
            </footer>
          </div>
          {/* ═══ نهاية المستند ═══ */}
        </section>
      ) : (
        <EmptyState title="تعذر تحميل الكشف" description="تحقق من الاتصال وحاول مجددًا." />
      )}

      {confirmLock && manifest.data?.manifest ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
            <div className="flex justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">قفل الكشف</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  سيتم تثبيت قائمة الركاب وتحويل الرحلة إلى حالة مغادرة. لا يمكن
                  التراجع عن هذا الإجراء.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setConfirmLock(false)}>
                <X />
              </Button>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setConfirmLock(false)}>
                تراجع
              </Button>
              <Button
                disabled={lock.isPending}
                onClick={() =>
                  lock.mutate(
                    { id: manifest.data!.manifest!.id, tripId: tripId! },
                    { onSuccess: () => setConfirmLock(false) },
                  )
                }
              >
                {lock.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                تأكيد القفل
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
