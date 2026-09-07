import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import { besport } from "./fonts/besport";
import "./globals.css";
import { Providers } from "./providers";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ticketty | نظام إدارة النقل",
  description: "منصة تشغيل وإدارة شركات النقل والحجوزات والمدفوعات",
  icons: {
    icon: [{ url: "/brand/logo-48.png", type: "image/png" }],
    apple: "/brand/apple-touch-icon.png",
  },
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
      className={`${cairo.variable} ${besport.variable}`}
      suppressHydrationWarning
    >
      <body className={cairo.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
