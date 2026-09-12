"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateRoute, useUpdateRoute } from "../hooks/use-routes";
import type { CreateRouteInput, TransportRoute } from "../types";

interface CreateRouteFormProps {
  route?: TransportRoute;
  onCreated?: () => void;
  onCancel?: () => void;
}

const initialForm = {
  name: "",
  fromCity: "",
  toCity: "",
  distanceKm: "",
  durationMinutes: "",
  stops: "",
};

export function CreateRouteForm({ route, onCreated, onCancel }: CreateRouteFormProps) {
  const [form, setForm] = useState(() =>
    route
      ? {
          name: route.name,
          fromCity: route.fromCity,
          toCity: route.toCity,
          distanceKm: route.distanceKm?.toString() ?? "",
          durationMinutes: route.durationMinutes?.toString() ?? "",
          stops: route.stops.map((stop) => stop.city).join("، "),
        }
      : initialForm,
  );
  const createMutation = useCreateRoute();
  const updateMutation = useUpdateRoute();
  const mutation = route ? updateMutation : createMutation;

  function updateField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const stops = form.stops
      .split("،")
      .flatMap((part) => part.split(","))
      .map((city) => city.trim())
      .filter(Boolean)
      .map((city, index) => ({ city, order: index + 1 }));

    const input: CreateRouteInput = {
      name: form.name.trim(),
      fromCity: form.fromCity.trim(),
      toCity: form.toCity.trim(),
      active: route?.active ?? true,
      ...(form.distanceKm ? { distanceKm: Number(form.distanceKm) } : {}),
      ...(form.durationMinutes
        ? { durationMinutes: Number(form.durationMinutes) }
        : {}),
      ...(stops.length ? { stops } : {}),
    };

    const options = {
      onSuccess: () => {
        setForm(initialForm);
        onCreated?.();
      },
    };
    if (route) updateMutation.mutate({ id: route.id, input }, options);
    else createMutation.mutate(input, options);
  }

  const error = mutation.error instanceof Error ? mutation.error.message : null;
  const labelClass = "text-sm font-medium";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{route ? "تعديل خط السير" : "إضافة خط سير"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {route ? "حدّث بيانات المسار ومحطاته الوسيطة." : "أدخل نقطة الانطلاق والوجهة وأي محطات وسيطة."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="route-name" className={labelClass}>اسم المسار</label>
          <Input
            id="route-name"
            maxLength={200}
            placeholder="مثال: الخرطوم — بورتسودان"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="from-city" className={labelClass}>مدينة الانطلاق</label>
          <Input
            id="from-city"
            maxLength={100}
            value={form.fromCity}
            onChange={(event) => updateField("fromCity", event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="to-city" className={labelClass}>مدينة الوصول</label>
          <Input
            id="to-city"
            maxLength={100}
            value={form.toCity}
            onChange={(event) => updateField("toCity", event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="distance" className={labelClass}>المسافة (كم)</label>
          <Input
            id="distance"
            type="number"
            min="0"
            step="1"
            value={form.distanceKm}
            onChange={(event) => updateField("distanceKm", event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="duration" className={labelClass}>المدة المتوقعة (دقيقة)</label>
          <Input
            id="duration"
            type="number"
            min="0"
            step="1"
            value={form.durationMinutes}
            onChange={(event) => updateField("durationMinutes", event.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label htmlFor="route-stops" className={labelClass}>المحطات الوسيطة (اختياري)</label>
          <Input
            id="route-stops"
            placeholder="شندي، عطبرة، هيا"
            value={form.stops}
            onChange={(event) => updateField("stops", event.target.value)}
          />
          <p className="text-xs text-muted-foreground">افصل بين أسماء المدن بفاصلة.</p>
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? <Button type="button" variant="outline" onClick={onCancel}>إلغاء</Button> : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="animate-spin" /> : null}
          {route ? "حفظ التعديلات" : "حفظ المسار"}
        </Button>
      </div>
    </form>
  );
}
