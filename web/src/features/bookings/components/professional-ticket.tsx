"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Ban, CalendarDays, CigaretteOff, Clock, Luggage, MapPin, Printer,
  ShieldCheck, Ticket as TicketIcon, User, UtensilsCrossed, X, ZoomIn, Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { barcodeValueFor, code128Svg } from "@/lib/barcode";
import type { Booking, Ticket, TripSeatsResponse } from "../types";
import { markTicketPrinted } from "../api";
import styles from "./professional-ticket.module.css";

type PrintableTrip = Pick<TripSeatsResponse["trip"], "id" | "departureAt" | "route"> & {
  bus: { plateNumber: string };
};
type TicketOrganization = {
  name: string;
  phone: string | null;
  ticketTerms: string | null;
  ticketBranding?: {
    tagline: string | null;
    primaryColor: string;
    secondaryColor: string;
    checkInMinutes: number;
    baggagePieces: number;
    logoUrl: string | null;
    busImageUrl: string | null;
  };
};
const NUMERIC_DATE = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
const ARABIC_WEEKDAY = new Intl.DateTimeFormat("ar-SD", { weekday: "long" });
const ARABIC_TIME = new Intl.DateTimeFormat("ar-SD", { hour: "2-digit", minute: "2-digit" });
const PAPER_WIDTH = 147 * 96 / 25.4;
const PAPER_HEIGHT = 70 * 96 / 25.4;

/** Fit a physical sheet, not its individual fields, to the available screen width. */
function TicketSheet({ children, zoom }: { children: ReactNode; zoom: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.5);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setFit(Math.min(entry.contentRect.width / PAPER_WIDTH, 2));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = fit * zoom;
  return (
    <div ref={viewport} className={styles.viewport} dir="ltr" data-testid="ticket-viewport" tabIndex={zoom > 1 ? 0 : undefined} aria-label="التذكرة — مرر لعرض التفاصيل عند التكبير">
      <div className={styles.sheetSpace} style={{ width: PAPER_WIDTH * scale, height: PAPER_HEIGHT * scale }}>
        <div className={styles.artboard} style={{ transform: `scale(${scale})` }}>{children}</div>
      </div>
    </div>
  );
}

export function TicketPreview({ booking, trip, organization, onClose, mode = "issued" }: {
  booking: Booking;
  trip: PrintableTrip;
  organization?: TicketOrganization;
  onClose: () => void;
  mode?: "issued" | "reprint";
}) {
  const tickets = booking.tickets;
  const [printTarget, setPrintTarget] = useState<"all" | number>("all");
  const [zoom, setZoom] = useState(1);
  const [printing, setPrinting] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const afterPrint = () => setPrintTarget("all");
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']") ?? [])
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handlePrint(which: "all" | number = "all") {
    if (printing) return;
    setPrinting(true);
    setPrintTarget(which);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await document.fonts.ready;
      const images = Array.from(dialog.current?.querySelectorAll<HTMLImageElement>(".ticket-print-area img") ?? []);
      await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
      window.print();
      const selected = which === "all" ? tickets : tickets.slice(which, which + 1);
      for (const ticket of selected) void markTicketPrinted(ticket.id).catch(() => undefined);
      toast.success("تم إرسال التذكرة إلى الطابعة", { description: "مقاس التذكرة 14.7 × 7 سم — فعّل طباعة ألوان الخلفية." });
    } finally {
      setPrinting(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={dialog} tabIndex={-1} className="ticket-preview-overlay fixed inset-0 z-50 flex items-stretch justify-center bg-foreground/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="ticket-preview-title" data-testid="ticket-preview-dialog">
      <div className="ticket-preview-panel max-h-[100dvh] w-full max-w-6xl overflow-y-auto overscroll-contain border border-border bg-background shadow-elevated sm:max-h-[95vh] sm:rounded-2xl">
        <div className="no-print sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
          <div className="min-w-0 pe-14">
            <h2 id="ticket-preview-title" className="font-display text-lg font-bold">{mode === "issued" ? "تم إصدار التذاكر بنجاح" : "معاينة وإعادة طباعة التذكرة"}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">نفس تخطيط التذكرة المطبوعة · 14.7 × 7 سم. كبّر المعاينة لقراءة التفاصيل.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setZoom(zoom === 1 ? 2 : 1)} aria-pressed={zoom > 1}>
              {zoom === 1 ? <ZoomIn /> : <Minimize2 />} {zoom === 1 ? "تكبير التذكرة" : "ملاءمة الشاشة"}
            </Button>
            {tickets.length > 1 ? <Button type="button" size="sm" variant="outline" disabled={printing} onClick={() => void handlePrint(0)}><Printer /> طباعة الأولى فقط</Button> : null}
            <Button type="button" size="sm" disabled={printing} onClick={() => void handlePrint("all")}><Printer /> {printing ? "تجهيز الطباعة…" : tickets.length > 1 ? "طباعة الكل" : "طباعة التذكرة"}</Button>
          </div>
          <Button type="button" size="icon" variant="ghost" className="absolute end-3 top-3" onClick={onClose} aria-label="إغلاق معاينة التذكرة" data-testid="ticket-preview-close"><X /></Button>
        </div>
        <div className="ticket-print-area space-y-4 bg-muted/40 p-3 sm:space-y-6 sm:p-5">
          {tickets.map((ticket, index) => (
            <div className="ticket-page" key={ticket.id} data-ticket-index={index} hidden={printTarget !== "all" && printTarget !== index}>
              <TicketSheet zoom={zoom}><ProfessionalTicket ticket={ticket} booking={booking} trip={trip} organization={organization} /></TicketSheet>
            </div>
          ))}
        </div>
      </div>
    </div>, document.body,
  );
}

export function ProfessionalTicket({ ticket, booking, trip, organization }: {
  ticket: Ticket;
  booking: Booking;
  trip: PrintableTrip;
  organization?: TicketOrganization;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void import("qrcode").then((QRCode) => QRCode.toDataURL(ticket.qrCode, {
      width: 220, margin: 1, errorCorrectionLevel: "M", color: { dark: "#061C35", light: "#FFFFFF" },
    })).then((value: string) => { if (active) setQrDataUrl(value); }).catch(() => { if (active) setQrDataUrl(null); });
    return () => { active = false; };
  }, [ticket.qrCode]);
  const barcode = useMemo(() => code128Svg(barcodeValueFor(ticket), { moduleWidth: 2, height: 54, quietZone: 12 }), [ticket]);
  const branding = organization?.ticketBranding;
  const departure = new Date(trip.departureAt);
  const reporting = new Date(departure.getTime() - (branding?.checkInMinutes ?? 30) * 60_000);
  const companyName = organization?.name ?? "Ticketty";
  const style = { "--ticket-primary": branding?.primaryColor ?? "#07558C", "--ticket-secondary": branding?.secondaryColor ?? "#F7941D" } as CSSProperties;
  return (
    <article className={cn("bus-ticket travel-ticket", styles.ticket)} style={style} dir="rtl" data-testid="bus-ticket" aria-label={`تذكرة ${ticket.passengerName}`}>
      <header dir="ltr" className={styles.hero} data-ticket-region="header">
        <div dir="rtl" className={styles.brand} data-ticket-region="brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated tenant asset */}
          <img src={branding?.logoUrl ?? "/brand/logo-48.png"} alt={`شعار ${companyName}`} className={styles.logo} />
          <div className={styles.brandCopy}>
            <h3>{companyName}</h3>
            <p>{branding?.tagline || "رحلتك آمنة.. لوجهات أجمل"}</p>
            {organization?.phone ? <p dir="ltr">{organization.phone}</p> : null}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated tenant asset */}
        <img src={branding?.busImageUrl ?? "/brand/ticket-bus-default.webp"} alt="" className={styles.busArt} aria-hidden="true" data-ticket-region="bus" />
        <div dir="rtl" className={styles.numberPanel} data-ticket-region="number"><span>رقم التذكرة</span><strong dir="ltr">{ticket.number}</strong></div>
      </header>
      <div dir="ltr" className={styles.body} data-ticket-region="body">
        <section dir="rtl" className={styles.passenger} aria-label="بيانات الراكب والموعد" data-ticket-region="passenger">
          <TicketField icon={<User />} label="اسم الراكب" value={ticket.passengerName} emphasis className={cn(styles.name, ticket.passengerName.length > 45 && styles.longName)} />
          <TicketField icon={<CalendarDays />} label={`تاريخ السفر · ${ARABIC_WEEKDAY.format(departure)}`} value={NUMERIC_DATE.format(departure)} ltr nowrap />
          <TicketField icon={<Clock />} label="زمن الحضور" value={ARABIC_TIME.format(reporting)} emphasis className={styles.time} />
          <TicketField icon={<Clock />} label="زمن القيام" value={ARABIC_TIME.format(departure)} emphasis className={styles.time} />
          <TicketField icon={<TicketIcon />} label="رقم المقعد" value={ticket.seatLabel} emphasis nowrap />
        </section>
        <section dir="rtl" className={styles.journey} aria-label="مسار الرحلة" data-ticket-region="journey">
          <RoutePoint label="من" city={trip.route.fromCity} station={ticket.boardingStop ?? trip.route.fromCity} />
          <span className={styles.routeArrow} aria-hidden="true">↓</span>
          <RoutePoint label="إلى" city={trip.route.toCity} station={ticket.dropOffStop ?? trip.route.toCity} />
        </section>
        <section dir="rtl" className={styles.instructions} aria-label="تعليمات السفر" data-ticket-region="instructions">
          <h4>تعليمات</h4>
          <div className={styles.baggage}><Luggage /><p>الأمتعة المسموحة: <span>{branding?.baggagePieces ?? 1} حقيبة</span></p></div>
          <ul>
            <Instruction icon={<CigaretteOff />} text="يُمنع التدخين داخل الحافلة." />
            <Instruction icon={<UtensilsCrossed />} text="يُمنع إدخال المأكولات والمشروبات." />
            <Instruction icon={<Ban />} text="يُمنع حمل المواد الخطرة أو القابلة للاشتعال." />
            <Instruction icon={<Clock />} text={`الحضور قبل القيام بـ${branding?.checkInMinutes ?? 30} دقيقة.`} />
          </ul>
        </section>
        <aside dir="rtl" className={styles.codes} aria-label="رموز التحقق" data-ticket-region="codes">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated QR data URL
            <img src={qrDataUrl} alt={`رمز QR للتذكرة ${ticket.number}`} className={styles.qr} />
          ) : <div className={styles.qr} aria-label="جار تجهيز رمز QR" />}
          <div className={styles.barcode} dangerouslySetInnerHTML={{ __html: barcode.svg }} />
          <strong className={styles.codeNumber} dir="ltr">{ticket.number}</strong>
          <span className={styles.status}><ShieldCheck />{booking.status === "CONFIRMED" ? "مؤكدة ومدفوعة" : booking.status}</span>
        </aside>
      </div>
      <footer className={styles.footer} data-ticket-region="footer"><span dir="ltr">app.suda-technologies.com</span><span>تم إصدار هذه التذكرة إلكترونيًا</span><strong>Powered by TICKETTY</strong></footer>
    </article>
  );
}
function RoutePoint({ label, city, station }: { label: string; city: string; station: string }) {
  return <div className={styles.routePoint}><MapPin /><div><p className={styles.routeLabel}>{label}</p><p className={styles.city}>{city}</p><p className={styles.station}>{station}</p></div></div>;
}
function Instruction({ icon, text }: { icon: ReactNode; text: string }) {
  return <li className={styles.instruction}>{icon}<span>{text}</span></li>;
}
function TicketField({ icon, label, value, ltr, emphasis, nowrap, className }: {
  icon: ReactNode; label: string; value: string; ltr?: boolean; emphasis?: boolean; nowrap?: boolean; className?: string;
}) {
  return <div className={cn(styles.field, className)} data-ticket-field={label}><span className={styles.fieldIcon}>{icon}</span><div className={styles.fieldCopy}><p className={styles.fieldLabel}>{label}</p><p className={cn(styles.fieldValue, emphasis && styles.emphasis, nowrap && styles.nowrap)} dir={ltr ? "ltr" : undefined}>{value}</p></div></div>;
}
