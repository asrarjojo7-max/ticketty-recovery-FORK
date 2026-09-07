"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { AlertCircle, Camera, CameraOff, CheckCircle2, Loader2, QrCode, Search, ShieldCheck, TicketCheck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatTripDate } from "@/features/trips/formatters";
import { useCheckInTicket, useFindTicket } from "../hooks/use-boarding";

export function BoardingScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [scanning, setScanning] = useState(false);
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"qr" | "id">("qr");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const findTicket = useFindTicket();
  const checkIn = useCheckInTicket();

  useEffect(() => () => controlsRef.current?.stop(), []);

  function search(code = value) {
    const normalized = code.trim();
    if (!normalized) return;
    findTicket.mutate({ value: normalized, mode });
  }

  async function startCamera() {
    setCameraError(null);
    setScanning(true);
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
    try {
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current ?? undefined,
        (result) => {
          if (!result) return;
          const code = result.getText();
          controlsRef.current?.stop();
          setScanning(false);
          setMode("qr");
          setValue(code);
          findTicket.mutate({ value: code, mode: "qr" });
        },
      );
    } catch {
      setScanning(false);
      setCameraError("تعذر تشغيل الكاميرا. اسمح بالوصول إليها أو استخدم الإدخال اليدوي.");
    }
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }

  const ticket = checkIn.data ?? findTicket.data;
  const error = findTicket.error instanceof Error ? findTicket.error.message : checkIn.error instanceof Error ? checkIn.error.message : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div><p className="mb-1.5 text-xs font-bold text-primary">بوابة الصعود</p><h1 className="font-display text-2xl font-bold sm:text-3xl">مسح التذاكر وتسجيل الركاب</h1><p className="mt-2 text-sm text-muted-foreground">تحقق من صلاحية التذكرة وسجّل الصعود في ثوانٍ.</p></div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60"><CardTitle className="flex items-center gap-2 font-display text-lg"><QrCode className="text-primary" />ماسح رمز QR</CardTitle></CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-dashed bg-[#081a2b]">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              {!scanning ? <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white/60"><Camera className="mb-3 h-10 w-10" /><p className="text-sm font-semibold text-white/80">الكاميرا متوقفة</p><p className="mt-1 text-xs">شغّل الكاميرا ووجّهها نحو رمز التذكرة</p></div> : <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-[#55dfcd] shadow-[0_0_0_999px_rgba(0,0,0,0.25)]"><span className="absolute -right-0.5 -top-0.5 h-5 w-5 border-r-4 border-t-4 border-white" /><span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 border-b-4 border-l-4 border-white" /></div>}
            </div>
            {cameraError ? <p className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{cameraError}</p> : null}
            <Button type="button" className="w-full" variant={scanning ? "outline" : "default"} onClick={scanning ? stopCamera : () => void startCamera()}>{scanning ? <><CameraOff /> إيقاف الكاميرا</> : <><Camera /> تشغيل الكاميرا</>}</Button>

            <div className="relative flex items-center"><div className="h-px flex-1 bg-border" /><span className="px-3 text-[11px] text-muted-foreground">أو تحقق يدويًا</span><div className="h-px flex-1 bg-border" /></div>
            <div className="flex gap-2">
              <select className="h-10 rounded-xl border border-input bg-card px-3 text-sm" value={mode} onChange={(event) => setMode(event.target.value as "qr" | "id")}><option value="qr">رمز QR</option><option value="id">معرّف التذكرة</option></select>
              <div className="relative flex-1"><Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="ps-9" dir="ltr" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder={mode === "qr" ? "ألصق رمز التحقق" : "أدخل معرف التذكرة"} /></div>
              <Button type="button" variant="outline" onClick={() => search()} disabled={!value.trim() || findTicket.isPending}>{findTicket.isPending ? <Loader2 className="animate-spin" /> : "تحقق"}</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-24">
          <CardContent className="p-5">
            {error ? <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center"><AlertCircle className="mx-auto h-10 w-10 text-destructive" /><h2 className="mt-3 font-display font-semibold">التذكرة غير صالحة</h2><p className="mt-1 text-sm text-destructive">{error}</p></div> : ticket ? <div className="space-y-5">
              <div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-600"><ShieldCheck className="h-6 w-6" /></span><div><h2 className="font-display font-semibold">تذكرة صالحة</h2><p className="font-mono text-xs text-muted-foreground" dir="ltr">{ticket.number}</p></div></div><Badge variant={ticket.status === "CHECKED_IN" ? "info" : "success"}>{ticket.status === "CHECKED_IN" ? "تم الصعود" : "جاهزة للصعود"}</Badge></div>
              <div className="space-y-3 rounded-2xl bg-muted/50 p-4 text-sm"><p className="flex justify-between gap-3"><span className="text-muted-foreground">المسافر</span><strong>{ticket.passengerName}</strong></p><p className="flex justify-between gap-3"><span className="text-muted-foreground">المقعد</span><strong>{ticket.seatLabel}</strong></p><p className="flex justify-between gap-3"><span className="text-muted-foreground">الرحلة</span><strong>{ticket.trip.route.name}</strong></p><p className="flex justify-between gap-3"><span className="text-muted-foreground">المغادرة</span><strong>{formatTripDate(ticket.trip.departureAt)}</strong></p></div>
              <Button className="w-full" size="lg" disabled={ticket.status === "CHECKED_IN" || checkIn.isPending} onClick={() => checkIn.mutate(ticket.id)}>{checkIn.isPending ? <Loader2 className="animate-spin" /> : ticket.status === "CHECKED_IN" ? <CheckCircle2 /> : <TicketCheck />}{ticket.status === "CHECKED_IN" ? "تم تسجيل الصعود" : "تأكيد صعود المسافر"}</Button>
            </div> : <div className="flex flex-col items-center py-12 text-center"><div className="rounded-2xl bg-muted p-4 text-muted-foreground"><User className="h-8 w-8" /></div><h2 className="mt-4 font-display font-semibold">بانتظار التذكرة</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">امسح الرمز أو أدخل رقم التحقق لعرض بيانات المسافر.</p></div>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
