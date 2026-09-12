"use client";

import { useDeferredValue, useState } from "react";
import { Ban, Loader2, Printer, TicketX, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTripDate } from "@/features/trips/formatters";
import { formatMoney } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { useBookings, useCancelBooking } from "../hooks/use-bookings";
import { useOrganizationForTicket } from "../hooks/use-organization";
import { TicketPreview } from "./ticket-preview";
import type { Booking, BookingStatus } from "../types";

const statusLabels: Record<BookingStatus, string> = { PENDING: "قيد الانتظار", CONFIRMED: "مؤكد", CANCELLED: "ملغى", REFUNDED: "مسترد" };

const paymentLabels: Record<string, string> = {
  CASH: "نقدي",
  CARD: "بطاقة",
  BANKAK: "بنكك",
  MTN_MOMO: "موبايل MTN",
  ZAIN_CASH: "زين كاش",
  BANK_TRANSFER: "تحويل بنكي",
};

const LIMIT = 50;

export function BookingHistory({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [ticketPreview, setTicketPreview] = useState<Booking | null>(null);
  const [reason, setReason] = useState("");
  const deferredSearch = useDeferredValue(search);

  const query = useBookings({
    search: deferredSearch || undefined,
    date: date || undefined,
    status: status || undefined,
    page,
    limit: LIMIT,
  });
  const cancelMutation = useCancelBooking();
  const organizationQuery = useOrganizationForTicket();
  const selectClass =
    "h-11 w-full rounded-xl border border-input bg-card px-3 text-base shadow-sm md:h-10 md:text-sm focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/10 sm:w-auto";
  const canPreviewTicket = (booking: Booking) =>
    booking.status === "CONFIRMED" && booking.tickets.length > 0 && Boolean(booking.trip.bus);

  const columns: ColumnDef<Booking, unknown>[] = [
    {
      header: "التذكرة / الراكب",
      cell: ({ row }) => (
        <div>
          <p className="font-semibold">{row.original.tickets[0]?.passengerName ?? "—"}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground" dir="ltr">
            {row.original.tickets[0]?.number ?? row.original.id.slice(-8)}
          </p>
        </div>
      ),
    },
    {
      header: "الرحلة",
      cell: ({ row }) => (
        <div>
          <p>{row.original.trip.route.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatTripDate(row.original.trip.departureAt)}
          </p>
        </div>
      ),
    },
    {
      header: "المقاعد",
      cell: ({ row }) =>
        row.original.tickets.map((t) => t.seatLabel).join("، ") || "—",
    },
    {
      header: "القيمة",
      cell: ({ row }) => (
        <span className="tabular font-semibold">
          {formatMoney(row.original.totalAmount)}
        </span>
      ),
    },
    {
      header: "الدفع",
      cell: ({ row }) => {
        const method = row.original.payments[0]?.method;
        return method ? paymentLabels[method] ?? method : "—";
      },
    },
    {
      header: "الحالة",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} domain="booking" />
      ),
    },
    {
      header: "",
      id: "actions",
      cell: ({ row }) => {
        const booking = row.original;
        const previewable = canPreviewTicket(booking);
        const cancellable = canManage && booking.status === "CONFIRMED";
        if (!previewable && !cancellable) return null;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {previewable ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTicketPreview(booking)}
              >
                <Printer /> عرض / طباعة
              </Button>
            ) : null}
            {cancellable ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setSelected(booking)}
              >
                <Ban /> إلغاء واسترداد
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];

  function handleCancel() {
    if (!selected) return;
    cancelMutation.mutate(
      { id: selected.id, reason: reason.trim() },
      {
        onSuccess: (booking) => {
          toast.success("تم إلغاء الحجز وإنشاء الاسترداد", {
            description: `الحجز ${booking.id.slice(-8).toUpperCase()} أصبح ${statusLabels[booking.status]}`,
          });
          setSelected(null);
          setReason("");
        },
        onError: (error) => {
          toast.error("تعذّر إلغاء الحجز", {
            description: error instanceof Error ? error.message : undefined,
          });
        },
      },
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <CardTitle className="font-display text-lg">سجل الحجوزات</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              ابحث عن مسافر أو تذكرة، وراجع حالة الدفع والاسترداد.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="date"
              className="sm:w-40"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setPage(1);
              }}
              aria-label="تاريخ الرحلة"
            />
            <select
              className={selectClass}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as BookingStatus | "");
                setPage(1);
              }}
              aria-label="حالة الحجز"
            >
              <option value="">كل الحالات</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          className="p-4"
          columns={columns}
          data={query.data}
          isLoading={query.isLoading}
          isError={query.isError}
          page={page}
          limit={LIMIT}
          onPageChange={setPage}
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="اسم، هاتف، رقم تذكرة..."
          searchValue={search}
          emptyIcon={TicketX}
          emptyTitle="لا توجد حجوزات مطابقة"
          emptyDesc="ستظهر الحجوزات المؤكدة والجارية هنا."
          onRetry={() => query.refetch()}
          renderMobileCard={(booking) => {
            const ticket = booking.tickets[0];
            const method = booking.payments[0]?.method;
            return (
              <article className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold">
                      {ticket?.passengerName ?? "—"}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">
                      {ticket?.number ?? booking.id.slice(-8)}
                    </p>
                  </div>
                  <StatusBadge status={booking.status} domain="booking" />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-muted/40 p-3 text-sm">
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">الرحلة</dt>
                    <dd className="mt-0.5 font-semibold">{booking.trip.route.name}</dd>
                    <dd className="text-xs text-muted-foreground">
                      {formatTripDate(booking.trip.departureAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">المقاعد</dt>
                    <dd className="mt-0.5 font-semibold">
                      {booking.tickets.map((item) => item.seatLabel).join("، ") || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">القيمة</dt>
                    <dd className="mt-0.5 font-bold text-primary">
                      {formatMoney(booking.totalAmount)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">الدفع</dt>
                    <dd className="mt-0.5">{method ? paymentLabels[method] ?? method : "—"}</dd>
                  </div>
                </dl>
                <div className="grid gap-2 sm:grid-cols-2">
                  {canPreviewTicket(booking) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => setTicketPreview(booking)}
                    >
                      <Printer /> عرض وطباعة التذكرة
                    </Button>
                  ) : null}
                  {canManage && booking.status === "CONFIRMED" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setSelected(booking)}
                    >
                      <Ban /> إلغاء واسترداد
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          }}
        />
      </CardContent>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-booking-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-elevated">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="cancel-booking-title" className="font-display text-lg font-semibold">
                  إلغاء الحجز واسترداد المبلغ
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  سيتم تحرير المقاعد وإنشاء سجل استرداد مالي لا يمكن حذفه.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelected(null)}
                aria-label="إغلاق"
              >
                <X />
              </Button>
            </div>
            <div className="mt-5 space-y-2">
              <label htmlFor="booking-cancel-reason" className="text-sm font-medium">
                سبب الإلغاء
              </label>
              <Input
                id="booking-cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                placeholder="سبب واضح وقابل للتدقيق"
                autoFocus
              />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setSelected(null)}>
                تراجع
              </Button>
              <Button
                variant="destructive"
                disabled={cancelMutation.isPending || reason.trim().length < 3}
                onClick={handleCancel}
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Ban />
                )}{" "}
                تأكيد الاسترداد
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {ticketPreview?.trip.bus ? (
        <TicketPreview
          booking={ticketPreview}
          trip={{
            id: ticketPreview.trip.id,
            departureAt: ticketPreview.trip.departureAt,
            route: ticketPreview.trip.route,
            bus: { plateNumber: ticketPreview.trip.bus.plateNumber },
          }}
          organization={organizationQuery.data ?? undefined}
          mode="reprint"
          onClose={() => setTicketPreview(null)}
        />
      ) : null}
    </Card>
  );
}
