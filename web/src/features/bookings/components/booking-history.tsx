"use client";

import { useDeferredValue, useState } from "react";
import { AlertCircle, Ban, Loader2, Search, TicketX, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTripDate } from "@/features/trips/formatters";
import { formatCurrency } from "@/lib/utils";
import { useBookings, useCancelBooking } from "../hooks/use-bookings";
import type { Booking, BookingStatus } from "../types";

const statusLabels: Record<BookingStatus, string> = { PENDING: "قيد الانتظار", CONFIRMED: "مؤكد", CANCELLED: "ملغى", REFUNDED: "مسترد" };
const statusVariants: Record<BookingStatus, "warning" | "success" | "destructive" | "secondary"> = { PENDING: "warning", CONFIRMED: "success", CANCELLED: "destructive", REFUNDED: "secondary" };

export function BookingHistory({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [reason, setReason] = useState("");
  const deferredSearch = useDeferredValue(search);
  const query = useBookings({ search: deferredSearch || undefined, date: date || undefined, status: status || undefined });
  const cancelMutation = useCancelBooking();
  const selectClass = "h-10 rounded-xl border border-input bg-card px-3 text-sm shadow-sm focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/10";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><CardTitle className="font-display text-lg">سجل الحجوزات</CardTitle><p className="mt-1 text-xs text-muted-foreground">ابحث عن مسافر أو تذكرة، وراجع حالة الدفع والاسترداد.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="ps-9 sm:w-64" placeholder="اسم، هاتف، رقم تذكرة..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
            <Input type="date" className="sm:w-40" value={date} onChange={(event) => setDate(event.target.value)} aria-label="تاريخ الرحلة" />
            <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value as BookingStatus | "")} aria-label="حالة الحجز"><option value="">كل الحالات</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {query.isLoading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12" />)}</div> : query.isError ? <EmptyState icon={<AlertCircle className="h-9 w-9" />} title="تعذر تحميل الحجوزات" description="تحقق من الاتصال ثم أعد المحاولة." /> : !query.data?.length ? <EmptyState icon={<TicketX className="h-9 w-9" />} title="لا توجد حجوزات مطابقة" description="ستظهر الحجوزات المؤكدة والجارية هنا." /> : (
          <Table>
            <TableHeader><TableRow><TableHead>التذكرة / الراكب</TableHead><TableHead>الرحلة</TableHead><TableHead>المقاعد</TableHead><TableHead>القيمة</TableHead><TableHead>الدفع</TableHead><TableHead>الحالة</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{query.data.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell><p className="font-semibold">{booking.tickets[0]?.passengerName ?? "—"}</p><p className="mt-0.5 font-mono text-xs text-muted-foreground" dir="ltr">{booking.tickets[0]?.number ?? booking.id.slice(-8)}</p></TableCell>
                <TableCell><p>{booking.trip.route.name}</p><p className="text-xs text-muted-foreground">{formatTripDate(booking.trip.departureAt)}</p></TableCell>
                <TableCell>{booking.tickets.map((ticket) => ticket.seatLabel).join("، ")}</TableCell>
                <TableCell className="font-semibold">{formatCurrency(Number(booking.totalAmount))} ج.س</TableCell>
                <TableCell>{booking.payments[0]?.method === "CASH" ? "نقدًا" : booking.payments[0]?.method === "CARD" ? "بطاقة" : booking.payments[0]?.method ?? "—"}</TableCell>
                <TableCell><Badge variant={statusVariants[booking.status]}>{statusLabels[booking.status]}</Badge></TableCell>
                <TableCell className="text-end">{canManage && booking.status === "CONFIRMED" ? <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setSelected(booking)}><Ban /> إلغاء واسترداد</Button> : null}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cancel-booking-title">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><h2 id="cancel-booking-title" className="font-display text-lg font-semibold">إلغاء الحجز واسترداد المبلغ</h2><p className="mt-1 text-sm text-muted-foreground">سيتم تحرير المقاعد وإنشاء سجل استرداد مالي لا يمكن حذفه.</p></div><Button variant="ghost" size="icon" onClick={() => setSelected(null)} aria-label="إغلاق"><X /></Button></div>
            <div className="mt-5 space-y-2"><label htmlFor="booking-cancel-reason" className="text-sm font-medium">سبب الإلغاء</label><Input id="booking-cancel-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="سبب واضح وقابل للتدقيق" autoFocus /></div>
            {cancelMutation.isError ? <p className="mt-3 text-sm text-destructive">{cancelMutation.error instanceof Error ? cancelMutation.error.message : "تعذر إلغاء الحجز"}</p> : null}
            <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setSelected(null)}>تراجع</Button><Button variant="destructive" disabled={cancelMutation.isPending || reason.trim().length < 3} onClick={() => cancelMutation.mutate({ id: selected.id, reason: reason.trim() }, { onSuccess: () => { setSelected(null); setReason(""); } })}>{cancelMutation.isPending ? <Loader2 className="animate-spin" /> : <Ban />} تأكيد الاسترداد</Button></div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
