"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Bus, CalendarDays, MapPin, Printer, Ticket as TicketIcon, User, X } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { Booking, Ticket, TripSeatsResponse } from "../types";

interface TicketPreviewProps {
  booking: Booking;
  trip: TripSeatsResponse["trip"];
  onClose: () => void;
}

export function TicketPreview({ booking, trip, onClose }: TicketPreviewProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="ticket-preview-title">
      <div className="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-background shadow-2xl">
        <div className="no-print flex items-center justify-between border-b p-4">
          <div>
            <h2 id="ticket-preview-title" className="font-semibold">تم الحجز بنجاح</h2>
            <p className="text-sm text-muted-foreground">يمكنك الآن طباعة التذكرة أو إغلاق المعاينة.</p>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="إغلاق"><X /></Button>
        </div>

        <div className="ticket-print-area space-y-5 p-5">
          {booking.tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} booking={booking} trip={trip} />
          ))}
        </div>

        <div className="no-print flex justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={onClose}>إغلاق</Button>
          <Button type="button" onClick={() => window.print()}><Printer /> طباعة التذكرة</Button>
        </div>
      </div>
    </div>
  );
}

function TicketCard({ ticket, booking, trip }: { ticket: Ticket; booking: Booking; trip: TripSeatsResponse["trip"] }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(ticket.qrCode, { width: 220, margin: 1, errorCorrectionLevel: "M" })
      .then((value) => { if (active) setQrDataUrl(value); })
      .catch(() => { if (active) setQrDataUrl(null); });
    return () => { active = false; };
  }, [ticket.qrCode]);

  return (
    <article className="ticket-card break-after-page overflow-hidden rounded-2xl border-2 border-primary/25 bg-card">
      <div className="flex items-center justify-between bg-primary px-5 py-4 text-primary-foreground">
        <div className="flex items-center gap-3"><TicketIcon className="h-7 w-7" /><div><p className="text-xs opacity-80">TICKETTY</p><h3 className="font-bold">تذكرة سفر</h3></div></div>
        <p className="font-mono text-sm font-bold" dir="ltr">{ticket.number}</p>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">خط السير</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-bold"><MapPin className="h-5 w-5 text-primary" />{trip.route.fromCity} ← {trip.route.toCity}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Detail icon={User} label="الراكب" value={ticket.passengerName} />
            <Detail icon={CalendarDays} label="موعد الرحلة" value={new Intl.DateTimeFormat("ar-SD", { dateStyle: "medium", timeStyle: "short" }).format(new Date(trip.departureAt))} />
            <Detail icon={Bus} label="الحافلة" value={trip.bus.plateNumber} />
            <Detail icon={TicketIcon} label="المقعد" value={ticket.seatLabel} />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <span className="text-sm text-muted-foreground">قيمة التذكرة</span>
            <span className="font-bold text-primary">{formatCurrency(Number(ticket.fare))} ج.س</span>
          </div>
        </div>
        <div className="flex min-w-40 flex-col items-center justify-center border-t border-dashed pt-4 sm:border-r sm:border-t-0 sm:ps-5 sm:pt-0">
          {qrDataUrl ? <Image src={qrDataUrl} width={150} height={150} unoptimized alt={`رمز QR للتذكرة ${ticket.number}`} /> : <div className="h-[150px] w-[150px] animate-pulse rounded bg-muted" />}
          <p className="mt-2 text-center text-[10px] text-muted-foreground">رمز تحقق فريد</p>
        </div>
      </div>
      <div className="border-t border-dashed px-5 py-3 text-center text-xs text-muted-foreground">رقم الحجز: {booking.id}</div>
    </article>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return <div><p className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}
