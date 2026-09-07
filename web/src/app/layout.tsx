import type { Metadata } from "next";
import { Cairo, Mada } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const mada = Mada({
  subsets: ["arabic", "latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ticketty | نظام إدارة النقل",
  description: "منصة تشغيل وإدارة شركات النقل والحجوزات والمدفوعات",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} ${mada.variable}`}
      suppressHydrationWarning
    >
      <body className={cairo.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
