"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { AlertCircle, Ban, Camera, CameraOff, CheckCircle2, CreditCard, Loader2, QrCode, ScanLine, Search, ShieldCheck, TicketCheck, User, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatTripDate } from "@/features/trips/formatters";
import { useBoardingValidate, useCheckInTicket } from "../hooks/use-boarding";
import type { TicketValidationCode } from "@/features/bookings/types";

/* ── حالات التحقق الرسمية — نفس مفردات الخادم ──────────────────
 * ليست ألوانًا فقط: أيقونة + نص عربي واضح لكل حالة (قاعدة UX-7).
 * مصدر السلطة دائمًا استجابة /tickets/validate من الخادم.
 */

const VALIDATION_STATES: Record<
  TicketValidationCode,
  { label: string; tone: "success" | "info" | "destructive" | "warning" | "secondary"; icon: typeof ShieldCheck }
> = {
  VALID: { label: "صالحة — جاهزة للصعود", tone: "success", icon: ShieldCheck },
  ALREADY_BOARDED: { label: "تم تسجيل الصعود مسبقًا", tone: "info", icon: CheckCircle2 },
  CANCELLED: { label: "ملغاة", tone: "destructive", icon: XCircle },
  REFUNDED: { label: "مستردة", tone: "destructive", icon: XCircle },
  NOT_FOUND: { label: "غير موجودة", tone: "destructive", icon: Ban },
  PAYMENT_PENDING: { label: "الدفع غير مكتمل", tone: "warning", icon: CreditCard },
  WRONG_TRIP: { label: "تذكرة رحلة أخرى", tone: "warning", icon: AlertCircle },
  BOARDING_CLOSED: { label: "الرحلة غادرت/ملغاة", tone: "destructive", icon: Ban },
};

export function BoardingScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [scanning, setScanning] = useState(false);
  const [value, setValue] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const validate = useBoardingValidate();
  const checkIn = useCheckInTicket();

  useEffect(() => () => controlsRef.current?.stop(), []);

  function search(code = value) {
    const normalized = code.trim();
    if (!normalized) return;
    validate.mutate({ code: normalized });
  }

  /**
   * ماسح الكاميرا: يقرأ الباركود المطبوع (Code128 — توكِن TB-…)
   * ورمز QR (uuid). كلاهما يمر عبر نفس مسار التحقق الرسمي.
   */
  async function startCamera() {
    setCameraError(null);
    setScanning(true);
    // الماسح متعدد الصيغ: يقرأ Code128 (باركود TB-… المطبوع) وQR معًا.
    const reader = new BrowserMultiFormatReader(undefined, {
      delayBetweenScanAttempts: 250,
    });
    try {
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        videoRef.current ?? undefined,
        (result) => {
          if (!result) return;
          const code = result.getText();
          controlsRef.current?.stop();
          setScanning(false);
          setValue(code);
          // نفس مسار التحقق المستخدم في الإدخال اليدوي — لا مسار خاص بالمسح
          search(code);
        },
      );
    } catch {
      setScanning(false);
      setCameraError("تعذر تشغيل الكاميرا. اسمح بالوصول إليها من إعدادات المتصفح، أو أدخل الرقم المطبوع على التذكرة يدويًا.");
    }
  }

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }

  const result = validate.data ?? null;
  const ticket = checkIn.data ?? result?.ticket ?? null;
  const state = result ? VALIDATION_STATES[result.code] : null;
  // بعد نجاح تسجيل الصعود نخفي زر الصعود فورًا (النتيجة القديمة ما زالت
  // تقول VALID — لا نعتمد عليها) — الخادم وحده مصدر السلطة عبر checkIn.
  const checkedIn = Boolean(checkIn.data);
  const boardable = !checkedIn && result?.boardable === true;
  const isPending = validate.isPending || checkIn.isPending;
  const error =
    validate.error instanceof Error ? validate.error.message : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="بوابة الصعود"
        title="مسح التذاكر وتسجيل الركاب"
        subtitle="امسح باركود التذكرة (TB-…) أو أدخل رقمها المطبوع (TK-…) وسجّل الصعود في ثوانٍ."
        icon={QrCode}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <ScanLine className="text-primary" />
              ماسح التذكرة (باركود + QR)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-6">
            {/* الهاتف يحتاج نافذة عمودية كبيرة لالتقاط الباركود من مسافة
                مريحة؛ سطح المكتب يبقى أعرض كي لا يطغى على بطاقة النتيجة. */}
            <div className="relative min-h-[380px] w-full overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-gradient-navy aspect-[3/4] max-h-[65dvh] sm:min-h-[420px] sm:aspect-[4/3] lg:min-h-[460px] lg:aspect-[16/10]">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              {!scanning ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white/60">
                  <Camera className="mb-3 h-10 w-10" />
                  <p className="text-sm font-semibold text-white/80">الكاميرا متوقفة</p>
                  <p className="mt-1 text-xs">وجّهها نحو باركود التذكرة أو رمز QR</p>
                </div>
              ) : (
                <div className="pointer-events-none absolute inset-y-[17%] inset-x-[8%] rounded-2xl border-2 border-primary-glow shadow-[0_0_0_999px_rgba(0,0,0,0.25)] sm:inset-y-[20%] sm:inset-x-[12%]">
                  <span className="absolute -end-0.5 -top-0.5 h-5 w-5 border-s-4 border-t-4 border-white" />
                  <span className="absolute -bottom-0.5 -start-0.5 h-5 w-5 border-b-4 border-e-4 border-white" />
                </div>
              )}
            </div>
            {cameraError ? (
              <p className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {cameraError}
              </p>
            ) : null}
            <Button
              type="button"
              className="w-full"
              variant={scanning ? "outline" : "default"}
              onClick={scanning ? stopCamera : () => void startCamera()}
            >
              {scanning ? (
                <>
                  <CameraOff /> إيقاف الكاميرا
                </>
              ) : (
                <>
                  <Camera /> تشغيل الكاميرا
                </>
              )}
            </Button>

            <div className="relative flex items-center">
              <div className="h-px flex-1 bg-border" />
              <span className="px-3 text-[11px] text-muted-foreground">أو تحقق يدويًا</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="ps-9"
                  dir="ltr"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") search();
                  }}
                  placeholder="TK-… أو TB-… أو رمز QR"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => search()}
                disabled={!value.trim() || validate.isPending}
              >
                {validate.isPending ? <Loader2 className="animate-spin" /> : "تحقق"}
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              الباركود المطبوع على التذكرة يبدأ بـ{" "}
              <span dir="ltr" className="font-mono">
                TB-
              </span>{" "}
              ورقمها المطبوع يبدأ بـ{" "}
              <span dir="ltr" className="font-mono">
                TK-
              </span>{" "}
              — كلاهما يمر بنفس التحقق الرسمي من الخادم (وليس من محتوى الباركود).
            </p>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-24">
          <CardContent className="p-5">
            {isPending && !result ? (
              <div className="flex flex-col items-center py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="mt-3 text-sm text-muted-foreground">جارٍ التحقق من التذكرة…</p>
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center">
                <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
                <h2 className="mt-3 font-display font-semibold">تعذر التحقق</h2>
                <p className="mt-1 text-sm text-destructive">{error}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  تحقق من الاتصال ثم أعد المحاولة. التذاكر من شركة أخرى لا تظهر هنا أبدًا.
                </p>
              </div>
            ) : result && state ? (
              <div className="space-y-5">
                {/* نتيجة التحقق الرسمية: أيقونة + نص الحالة المعياري */}
                <div className={`rounded-2xl border p-4 text-center ${
                  result.code === "VALID"
                    ? "border-success/30 bg-success/10"
                    : result.code === "ALREADY_BOARDED"
                      ? "border-primary/30 bg-primary/10"
                      : "border-destructive/30 bg-destructive/5"
                }`}>
                  {(() => {
                    const StateIcon = state.icon;
                    const color =
                      result.code === "VALID"
                        ? "text-success"
                        : result.code === "ALREADY_BOARDED"
                          ? "text-primary"
                          : "text-destructive";
                    return <StateIcon className={`mx-auto h-12 w-12 ${color}`} />;
                  })()}
                  <h2 className="mt-2 font-display text-lg font-bold">
                    {result.code === "VALID"
                      ? "✓ تذكرة صالحة"
                      : result.code === "ALREADY_BOARDED"
                        ? "ℹ صعد هذا المسافر مسبقًا"
                        : "✗ تذكرة غير قابلة للصعود"}
                  </h2>
                  <p className="mt-1 text-sm font-semibold">{result.message}</p>
                  {/* الحالة المعيارية نصًا (وليس لونًا فقط) — قابل للقراءة الآلية */}
                  <Badge
                    className="mt-2"
                    variant={
                      state.tone === "success"
                        ? "success"
                        : state.tone === "info"
                          ? "info"
                          : state.tone === "warning"
                            ? "warning"
                            : state.tone === "destructive"
                              ? "destructive"
                              : "secondary"
                    }
                  >
                    {state.label}
                  </Badge>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground" dir="ltr">
                    {result.code}
                  </p>
                </div>

                {ticket ? (
                  <>
                    <div className="space-y-3 rounded-2xl bg-muted/50 p-4 text-sm">
                      <p className="flex justify-between gap-3">
                        <span className="text-muted-foreground">المسافر</span>
                        <strong className="min-w-0 break-words text-end">{ticket.passengerName}</strong>
                      </p>
                      {ticket.passengerPhone ? (
                        <p className="flex justify-between gap-3">
                          <span className="text-muted-foreground">الهاتف</span>
                          <strong dir="ltr">{ticket.passengerPhone}</strong>
                        </p>
                      ) : null}
                      <p className="flex justify-between gap-3">
                        <span className="text-muted-foreground">المقعد</span>
                        <strong className="tabular-nums text-lg font-black text-primary" dir="ltr">
                          {ticket.seatLabel}
                        </strong>
                      </p>
                      <p className="flex justify-between gap-3">
                        <span className="text-muted-foreground">الرحلة</span>
                        <strong>{ticket.trip.route.fromCity} ← {ticket.trip.route.toCity}</strong>
                      </p>
                      <p className="flex justify-between gap-3">
                        <span className="text-muted-foreground">المغادرة</span>
                        <strong>{formatTripDate(ticket.trip.departureAt)}</strong>
                      </p>
                      <p className="flex justify-between gap-3">
                        <span className="text-muted-foreground">رقم التذكرة</span>
                        <strong className="font-mono" dir="ltr">{ticket.number}</strong>
                      </p>
                      {ticket.trip.bus ? (
                        <p className="flex justify-between gap-3">
                          <span className="text-muted-foreground">الحافلة</span>
                          <strong dir="ltr">{ticket.trip.bus.plateNumber}</strong>
                        </p>
                      ) : null}
                      {ticket.boardingStop ? (
                        <p className="flex justify-between gap-3">
                          <span className="text-muted-foreground">محطة الصعود</span>
                          <strong>{ticket.boardingStop}</strong>
                        </p>
                      ) : null}
                    </div>

                    {boardable ? (
                      <Button
                        className="w-full"
                        size="lg"
                        disabled={checkIn.isPending}
                        onClick={() =>
                          checkIn.mutate(ticket.id, {
                            onSuccess: () => search(ticket.number),
                          })
                        }
                      >
                        {checkIn.isPending ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <TicketCheck />
                        )}
                        تأكيد صعود المسافر
                      </Button>
                    ) : checkedIn || result.code === "ALREADY_BOARDED" ? (
                      <div className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 p-3 text-sm font-semibold text-primary">
                        <CheckCircle2 className="h-4 w-4" />
                        {checkedIn && !result ? "تم تسجيل الصعود" : "تم تسجيل صعود هذا المسافر"}
                        {ticket.boardedAt
                          ? ` — ${new Date(ticket.boardedAt).toLocaleString("ar-SD")}`
                          : ""}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 text-center">
                <div className="rounded-2xl bg-muted p-4 text-muted-foreground">
                  <User className="h-8 w-8" />
                </div>
                <h2 className="mt-4 font-display font-semibold">بانتظار التذكرة</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  امسح باركود التذكرة بالكاميرا أو أدخل رقمها المطبوع (يبدأ بـ TK-) لعرض
                  بيانات المسافر والتحقق من صلاحيتها.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
