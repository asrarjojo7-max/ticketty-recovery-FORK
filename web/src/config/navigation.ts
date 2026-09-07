import {
  LayoutDashboard,
  Ticket,
  MapPin,
  Bus,
  FileText,
  Settings,
  QrCode,
  HandCoins,
  ClipboardList,
  BookOpen,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Optional badge label shown next to the item (e.g. "جديد"). */
  badge?: string;
  permissions?: string[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * مصدر روابط التنقل الوحيد — أي صفحة جديدة تُضاف هنا فقط.
 */
export const navigation: NavSection[] = [
  {
    label: "الرئيسية",
    items: [
      {
        title: "لوحة التحكم",
        href: "/dashboard",
        icon: LayoutDashboard,
        permissions: ["reports.read"],
      },
    ],
  },
  {
    label: "العمليات",
    items: [
      {
        title: "الحجوزات والتذاكر",
        href: "/bookings",
        icon: Ticket,
        permissions: ["bookings.read", "bookings.read.own"],
      },
      {
        title: "بوابة الصعود",
        href: "/boarding",
        icon: QrCode,
        permissions: ["tickets.write", "tickets.write.own"],
      },
      {
        title: "الرحلات والمسارات",
        href: "/trips",
        icon: MapPin,
        permissions: ["trips.read"],
      },
      {
        title: "الأسطول والمقاعد",
        href: "/buses",
        icon: Bus,
        permissions: ["fleet.read"],
      },
      {
        title: "الوكلاء والعمولات",
        href: "/agents",
        icon: HandCoins,
        permissions: ["agents.read", "agents.read.own"],
      },
      {
        title: "منفستو الرحلات",
        href: "/manifests",
        icon: ClipboardList,
        permissions: ["manifests.read"],
      },
    ],
  },
  {
    label: "الإدارة",
    items: [
      {
        title: "التقارير المالية",
        href: "/financial",
        icon: FileText,
        permissions: ["reports.read", "expenses.read", "settlements.read"],
      },
      {
        title: "دفتر الأستاذ",
        href: "/accounting",
        icon: BookOpen,
        permissions: ["accounting.read"],
      },
      {
        title: "الإعدادات",
        href: "/settings",
        icon: Settings,
        permissions: ["settings.read"],
      },
    ],
  },
];
