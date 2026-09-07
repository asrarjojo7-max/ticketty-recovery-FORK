"use client";

import { useMemo, useState } from "react";
import { Bus, CalendarClock, CheckCircle2, Plus, Search } from "lucide-react";
import { useSession } from "@/components/layout/session-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateRouteForm } from "./create-route-form";
import { CreateTripForm } from "./create-trip-form";
import { RoutesList } from "./routes-list";
import { TripsTable } from "./trips-table";
import { useRoutes } from "../hooks/use-routes";
import { useTrips } from "../hooks/use-trips";
import type { TransportRoute, TripFilters, TripStatus } from "../types";

const selectClass =
  "flex h-10 rounded-xl border border-input bg-card px-3.5 py-1 text-sm shadow-sm transition-colors hover:border-primary/25 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/10";

function hasPermission(permissions: string[], permission: string): boolean {
  return permissions.includes("*") || permissions.includes(permission);
}

export function TripsFeature() {
  const user = useSession();
  const [activeTab, setActiveTab] = useState("trips");
  const [showTripForm, setShowTripForm] = useState(false);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [editingRoute, setEditingRoute] = useState<TransportRoute | undefined>();
  const [routeSearch, setRouteSearch] = useState("");
  const [filters, setFilters] = useState<TripFilters>({});

  const tripsQuery = useTrips(filters);
  const routesQuery = useRoutes();
  const canManageTrips = hasPermission(user.permissions, "trips.write");
  const canManageRoutes = hasPermission(user.permissions, "routes.write");

  const visibleRoutes = useMemo(() => {
    const search = routeSearch.trim().toLocaleLowerCase("ar");
    if (!search) return routesQuery.data;
    return routesQuery.data?.filter((route) =>
      [route.name, route.fromCity, route.toCity].some((value) =>
        value.toLocaleLowerCase("ar").includes(search),
      ),
    );
  }, [routeSearch, routesQuery.data]);

  const tripStats = useMemo(() => {
    const trips = tripsQuery.data ?? [];
    return {
      scheduled: trips.filter((trip) => trip.status === "SCHEDULED").length,
      active: trips.filter((trip) => ["OPEN", "FULL", "DEPARTED"].includes(trip.status)).length,
      completed: trips.filter((trip) => trip.status === "COMPLETED").length,
    };
  }, [tripsQuery.data]);

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1.5 text-xs font-bold text-primary">مركز العمليات</p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">الرحلات والمسارات</h1>
          <p className="mt-2 text-sm text-muted-foreground">خطط خطوط السير، جدوِل الرحلات، وتابع جاهزية التشغيل من واجهة واحدة.</p>
        </div>
        {activeTab === "trips" && canManageTrips ? (
          <Button onClick={() => setShowTripForm((value) => !value)}><Plus /> إضافة رحلة</Button>
        ) : activeTab === "routes" && canManageRoutes ? (
          <Button onClick={() => { setEditingRoute(undefined); setShowRouteForm((value) => !value); }}><Plus /> إضافة مسار</Button>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList>
          <TabsTrigger value="trips">جدول الرحلات</TabsTrigger>
          <TabsTrigger value="routes">خطوط السير</TabsTrigger>
        </TabsList>

        <TabsContent value="trips" className="space-y-5">
          {showTripForm ? (
            <Card><CardContent className="pt-6"><CreateTripForm onCreated={() => setShowTripForm(false)} onCancel={() => setShowTripForm(false)} /></CardContent></Card>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard icon={CalendarClock} label="مجدولة" value={tripStats.scheduled} />
            <SummaryCard icon={Bus} label="نشطة" value={tripStats.active} />
            <SummaryCard icon={CheckCircle2} label="مكتملة" value={tripStats.completed} />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
                <Input
                  type="date"
                  aria-label="تصفية بتاريخ الرحلة"
                  className="md:w-44"
                  value={filters.date ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value || undefined }))}
                />
                <select
                  aria-label="تصفية بالمسار"
                  className={selectClass}
                  value={filters.routeId ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, routeId: event.target.value || undefined }))}
                >
                  <option value="">كل المسارات</option>
                  {routesQuery.data?.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}
                </select>
                <select
                  aria-label="تصفية بالحالة"
                  className={selectClass}
                  value={filters.status ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, status: (event.target.value || undefined) as TripStatus | undefined }))}
                >
                  <option value="">كل الحالات</option>
                  <option value="SCHEDULED">مجدولة</option>
                  <option value="OPEN">مفتوحة للحجز</option>
                  <option value="FULL">مكتملة المقاعد</option>
                  <option value="DEPARTED">نشطة</option>
                  <option value="COMPLETED">مكتملة</option>
                  <option value="CANCELLED">ملغاة</option>
                </select>
                {Object.values(filters).some(Boolean) ? (
                  <Button variant="ghost" size="sm" onClick={() => setFilters({})}>مسح التصفية</Button>
                ) : null}
              </div>
              <TripsTable
                trips={tripsQuery.data}
                isLoading={tripsQuery.isLoading}
                isError={tripsQuery.isError}
                canManage={canManageTrips}
                onRetry={() => tripsQuery.refetch()}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="routes" className="space-y-5">
          {showRouteForm ? (
            <Card><CardContent className="pt-6"><CreateRouteForm route={editingRoute} onCreated={() => { setShowRouteForm(false); setEditingRoute(undefined); }} onCancel={() => { setShowRouteForm(false); setEditingRoute(undefined); }} /></CardContent></Card>
          ) : null}
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="ps-9" placeholder="ابحث باسم المسار أو المدينة..." value={routeSearch} onChange={(event) => setRouteSearch(event.target.value)} />
          </div>
          <RoutesList
            routes={visibleRoutes}
            isLoading={routesQuery.isLoading}
            isError={routesQuery.isError}
            canManage={canManageRoutes}
            onEdit={(route) => { setEditingRoute(route); setShowRouteForm(true); }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface SummaryCardProps {
  icon: typeof CalendarClock;
  label: string;
  value: number;
}

function SummaryCard({ icon: Icon, label, value }: SummaryCardProps) {
  return (
    <Card className="group transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary ring-4 ring-primary/[0.035] transition-transform group-hover:scale-105"><Icon className="h-5 w-5" /></div>
        <div><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value.toLocaleString("ar-SD")}</p></div>
      </CardContent>
    </Card>
  );
}
