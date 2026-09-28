"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDrivers } from "@/features/fleet";
import { useUpdateTrip } from "../hooks/use-trips";
import type { Trip } from "../types";

const local = (value: string | null) =>
  value
    ? new Date(
        new Date(value).getTime() - new Date().getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";

const selectClass =
  "h-11 w-full rounded-xl border border-input bg-card px-3 text-base md:h-10 md:text-sm";

export function EditTripForm({
  trip,
  onDone,
}: {
  trip: Trip;
  onDone: () => void;
}) {
  const drivers = useDrivers("", "ACTIVE");
  const mutation = useUpdateTrip();
  const [form, setForm] = useState({
    departureAt: local(trip.departureAt),
    arrivalAt: local(trip.arrivalAt),
    driverId: trip.driverId ?? "",
    price: "",
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate(
      {
        id: trip.id,
        input: {
          departureAt: new Date(form.departureAt).toISOString(),
          arrivalAt: form.arrivalAt
            ? new Date(form.arrivalAt).toISOString()
            : undefined,
          driverId: form.driverId || undefined,
          price: form.price ? Number(form.price) : undefined,
        },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">تعديل الرحلة</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {trip.route.name} · {trip.bus.plateNumber}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          حالة الرحلة تُدار من إجراءات التشغيل المخصصة ولا يمكن تغييرها من نموذج التعديل.
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium">المغادرة</span>
        <Input
          required
          type="datetime-local"
          value={form.departureAt}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              departureAt: event.target.value,
            }))
          }
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">الوصول المتوقع</span>
        <Input
          type="datetime-local"
          value={form.arrivalAt}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              arrivalAt: event.target.value,
            }))
          }
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">السائق</span>
        <select
          className={selectClass}
          value={form.driverId}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              driverId: event.target.value,
            }))
          }
        >
          <option value="">بدون تعيين</option>
          {drivers.data?.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name} — {driver.licenseNumber}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium">سعر جديد للمقاعد المتاحة</span>
        <Input
          type="number"
          min="0.01"
          step="0.01"
          value={form.price}
          onChange={(event) =>
            setForm((current) => ({ ...current, price: event.target.value }))
          }
          placeholder="اختياري"
        />
      </label>

      {mutation.isError ? (
        <p className="text-sm text-destructive">
          {mutation.error instanceof Error
            ? mutation.error.message
            : "تعذر تحديث الرحلة"}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          إلغاء
        </Button>
        <Button disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
          حفظ التعديلات
        </Button>
      </div>
    </form>
  );
}
