"use client";

import { useState } from "react";
import { AlertCircle, Ban, Bus, CheckCircle2, Loader2, Pencil, Play, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditTripForm } from "./edit-trip-form";
import { formatTripDate, tripStatusLabels } from "../formatters";
import { useCancelTrip, useUpdateTrip } from "../hooks/use-trips";
import type { Trip, TripStatus } from "../types";

interface TripsTableProps {
  trips?: Trip[];
  isLoading: boolean;
  isError: boolean;
  canManage: boolean;
  onRetry: () => void;
}

const badgeVariants: Record<TripStatus, "secondary" | "success" | "warning" | "info" | "destructive" | "outline"> = {
  SCHEDULED: "secondary",
  OPEN: "success",
  FULL: "warning",
  DEPARTED: "info",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

function nextAction(status: TripStatus): { label: string; status: TripStatus; icon: typeof Play } | null {
  if (status === "SCHEDULED") return { label: "فتح الحجز", status: "OPEN", icon: Play };
  if (status === "OPEN" || status === "FULL") return { label: "بدء الرحلة", status: "DEPARTED", icon: Play };
  if (status === "DEPARTED") return { label: "إكمال", status: "COMPLETED", icon: CheckCircle2 };
  return null;
}

export function TripsTable({ trips, isLoading, isError, canManage, onRetry }: TripsTableProps) {
  const updateMutation = useUpdateTrip();
  const cancelMutation = useCancelTrip();
  const [tripToCancel, setTripToCancel] = useState<Trip | null>(null);
  const [tripToEdit, setTripToEdit] = useState<Trip | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  if (isLoading) {
    return <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-12 w-full" />)}</div>;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div>
          <h3 className="font-semibold">تعذر تحميل الرحلات</h3>
          <p className="text-sm text-muted-foreground">تحقق من الاتصال ثم أعد المحاولة.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw /> إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (!trips?.length) {
    return <EmptyState icon={<Bus className="h-10 w-10" />} title="لا توجد رحلات" description="أضف أول رحلة أو غيّر عوامل التصفية." />;
  }

  return (
    <div>
      {updateMutation.isError ? (
        <div className="m-4 flex items-center justify-between rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <span>{updateMutation.error instanceof Error ? updateMutation.error.message : "تعذر تحديث الرحلة"}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => updateMutation.reset()}>إغلاق</Button>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>خط السير</TableHead>
            <TableHead>الانطلاق</TableHead>
            <TableHead>الحافلة</TableHead>
            <TableHead>السائق</TableHead>
            <TableHead>الإشغال</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead className="text-end">إجراء سريع</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trips.map((trip) => {
            const action = nextAction(trip.status);
            const ActionIcon = action?.icon;
            const isUpdating = updateMutation.isPending && updateMutation.variables?.id === trip.id;
            return (
              <TableRow key={trip.id}>
                <TableCell>
                  <p className="font-medium">{trip.route.name}</p>
                  <p className="text-xs text-muted-foreground">{trip.route.fromCity} ← {trip.route.toCity}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatTripDate(trip.departureAt)}</TableCell>
                <TableCell>
                  <p>{trip.bus.plateNumber}</p>
                  <p className="text-xs text-muted-foreground">{trip.bus.model ?? trip.bus.seatTemplate.name}</p>
                </TableCell>
                <TableCell>{trip.driverName ?? "غير معيّن"}</TableCell>
                <TableCell>{trip._count.tickets} / {trip._count.tripSeats}</TableCell>
                <TableCell><Badge variant={badgeVariants[trip.status]}>{tripStatusLabels[trip.status]}</Badge></TableCell>
                <TableCell className="text-end">
                  <div className="flex justify-end gap-2">
                    {canManage && action && ActionIcon ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUpdating}
                        onClick={() => updateMutation.mutate({ id: trip.id, input: { status: action.status } })}
                      >
                        {isUpdating ? <Loader2 className="animate-spin" /> : <ActionIcon />}
                        {action.label}
                      </Button>
                    ) : null}
                    {canManage && !["COMPLETED", "CANCELLED"].includes(trip.status) ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setTripToEdit(trip)}><Pencil /> تعديل</Button>
                    ) : null}
                    {canManage && !["COMPLETED", "CANCELLED"].includes(trip.status) ? (
                      <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setTripToCancel(trip)}>
                        <Ban /> إلغاء
                      </Button>
                    ) : null}
                    {!action && ["COMPLETED", "CANCELLED"].includes(trip.status) ? <span className="text-xs text-muted-foreground">—</span> : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {tripToEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border bg-card p-6 shadow-2xl">
            <EditTripForm trip={tripToEdit} onDone={() => setTripToEdit(null)} />
          </div>
        </div>
      ) : null}

      {tripToCancel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="cancel-trip-title">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="cancel-trip-title" className="font-display text-lg font-semibold">إلغاء الرحلة</h2><p className="mt-1 text-sm text-muted-foreground">سيتم إلغاء الحجوزات المرتبطة ومعالجة المبالغ والعمولات تلقائيًا.</p></div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setTripToCancel(null)} aria-label="إغلاق"><X /></Button>
            </div>
            <div className="mt-5 space-y-2">
              <label htmlFor="trip-cancellation-reason" className="text-sm font-medium">سبب الإلغاء</label>
              <Input id="trip-cancellation-reason" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} maxLength={500} placeholder="اكتب سببًا واضحًا لإلغاء الرحلة" autoFocus />
            </div>
            {cancelMutation.isError ? <p className="mt-3 text-sm text-destructive">{cancelMutation.error instanceof Error ? cancelMutation.error.message : "تعذر إلغاء الرحلة"}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTripToCancel(null)}>تراجع</Button>
              <Button
                type="button"
                variant="destructive"
                disabled={cancelMutation.isPending || cancellationReason.trim().length < 3}
                onClick={() => cancelMutation.mutate(
                  { id: tripToCancel.id, reason: cancellationReason.trim() },
                  { onSuccess: () => { setTripToCancel(null); setCancellationReason(""); } },
                )}
              >
                {cancelMutation.isPending ? <Loader2 className="animate-spin" /> : <Ban />}
                تأكيد الإلغاء والاسترداد
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
