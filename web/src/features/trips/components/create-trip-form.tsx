"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDrivers } from "@/features/fleet";
import { useBuses } from "../hooks/use-buses";
import { useRoutes } from "../hooks/use-routes";
import { useCreateTrip } from "../hooks/use-trips";
import type { CreateTripInput, TripStatus } from "../types";

interface CreateTripFormProps {
  onCreated?: () => void;
  onCancel?: () => void;
}

const initialForm = {
  routeId: "",
  busId: "",
  departureAt: "",
  arrivalAt: "",
  driverId: "",
  price: "",
  status: "OPEN" as TripStatus,
};

const fieldClass = "space-y-2";
const labelClass = "text-sm font-medium";
const selectClass =
  "flex h-10 w-full rounded-xl border border-input bg-card px-3.5 py-1 text-sm shadow-sm transition-colors hover:border-primary/25 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/10 disabled:opacity-50";

export function CreateTripForm({ onCreated, onCancel }: CreateTripFormProps) {
  const [form, setForm] = useState(initialForm);
  const [validationError, setValidationError] = useState<string | null>(null);
  const routes = useRoutes();
  const buses = useBuses();
  const drivers = useDrivers("", "ACTIVE");
  const createMutation = useCreateTrip();

  const readyBuses = buses.data?.filter((bus) => bus.status === "READY") ?? [];
  const activeRoutes = routes.data?.filter((route) => route.active) ?? [];

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);

    const price = Number(form.price);
    if (!form.routeId || !form.busId || !form.departureAt || price <= 0) {
      setValidationError("يرجى تعبئة المسار والحافلة وموعد الانطلاق والسعر بصورة صحيحة.");
      return;
    }
    if (form.arrivalAt && new Date(form.arrivalAt) <= new Date(form.departureAt)) {
      setValidationError("موعد الوصول يجب أن يكون بعد موعد الانطلاق.");
      return;
    }

    const input: CreateTripInput = {
      routeId: form.routeId,
      busId: form.busId,
      departureAt: new Date(form.departureAt).toISOString(),
      price,
      status: form.status,
      ...(form.arrivalAt
        ? { arrivalAt: new Date(form.arrivalAt).toISOString() }
        : {}),
      ...(form.driverId ? { driverId: form.driverId } : {}),
    };

    createMutation.mutate(input, {
      onSuccess: () => {
        setForm(initialForm);
        onCreated?.();
      },
    });
  }

  const requestError =
    createMutation.error instanceof Error ? createMutation.error.message : null;
  const dependenciesError = routes.isError || buses.isError || drivers.isError;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">إضافة رحلة جديدة</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          عيّن المسار والحافلة وموعد الرحلة وسعر المقعد.
        </p>
      </div>

      {dependenciesError ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          تعذر تحميل المسارات أو الحافلات. أعد المحاولة قبل حفظ الرحلة.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className={fieldClass}>
          <label htmlFor="trip-route" className={labelClass}>المسار</label>
          <select
            id="trip-route"
            className={selectClass}
            value={form.routeId}
            onChange={(event) => updateField("routeId", event.target.value)}
            disabled={routes.isLoading}
            required
          >
            <option value="">اختر خط السير</option>
            {activeRoutes.map((route) => (
              <option key={route.id} value={route.id}>{route.name}</option>
            ))}
          </select>
          {!routes.isLoading && activeRoutes.length === 0 ? (
            <p className="text-xs text-warning-foreground">أضف مسارًا نشطًا أولًا.</p>
          ) : null}
        </div>

        <div className={fieldClass}>
          <label htmlFor="trip-bus" className={labelClass}>الحافلة</label>
          <select
            id="trip-bus"
            className={selectClass}
            value={form.busId}
            onChange={(event) => updateField("busId", event.target.value)}
            disabled={buses.isLoading}
            required
          >
            <option value="">اختر حافلة جاهزة</option>
            {readyBuses.map((bus) => (
              <option key={bus.id} value={bus.id}>
                {bus.plateNumber}{bus.model ? ` — ${bus.model}` : ""}
              </option>
            ))}
          </select>
          {!buses.isLoading && readyBuses.length === 0 ? (
            <p className="text-xs text-warning-foreground">لا توجد حافلات جاهزة حاليًا.</p>
          ) : null}
        </div>

        <div className={fieldClass}>
          <label htmlFor="trip-departure" className={labelClass}>موعد الانطلاق</label>
          <Input
            id="trip-departure"
            type="datetime-local"
            value={form.departureAt}
            onChange={(event) => updateField("departureAt", event.target.value)}
            required
          />
        </div>

        <div className={fieldClass}>
          <label htmlFor="trip-arrival" className={labelClass}>موعد الوصول المتوقع</label>
          <Input
            id="trip-arrival"
            type="datetime-local"
            value={form.arrivalAt}
            onChange={(event) => updateField("arrivalAt", event.target.value)}
          />
        </div>

        <div className={fieldClass}>
          <label htmlFor="trip-price" className={labelClass}>سعر التذكرة</label>
          <Input
            id="trip-price"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={form.price}
            onChange={(event) => updateField("price", event.target.value)}
            required
          />
        </div>

        <div className={fieldClass}>
          <label htmlFor="trip-status" className={labelClass}>الحالة الابتدائية</label>
          <select
            id="trip-status"
            className={selectClass}
            value={form.status}
            onChange={(event) => updateField("status", event.target.value as TripStatus)}
          >
            <option value="OPEN">مفتوحة للحجز</option>
            <option value="SCHEDULED">مجدولة</option>
          </select>
        </div>

        <div className={`${fieldClass} md:col-span-2`}>
          <label htmlFor="trip-driver" className={labelClass}>السائق المعيّن (اختياري)</label>
          <select id="trip-driver" className={selectClass} value={form.driverId} onChange={(event) => updateField("driverId", event.target.value)} disabled={drivers.isLoading}>
            <option value="">بدون تعيين سائق</option>
            {drivers.data?.filter((driver) => new Date(driver.licenseExpiry) > new Date()).map((driver) => <option key={driver.id} value={driver.id}>{driver.name} — {driver.licenseNumber}</option>)}
          </select>
        </div>
      </div>

      {validationError || requestError ? (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4" />
          {validationError ?? requestError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>إلغاء</Button>
        ) : null}
        <Button
          type="submit"
          disabled={createMutation.isPending || routes.isLoading || buses.isLoading || drivers.isLoading}
        >
          {createMutation.isPending ? <Loader2 className="animate-spin" /> : null}
          حفظ الرحلة
        </Button>
      </div>
    </form>
  );
}
