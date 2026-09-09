/**
 * أسماء الصلاحيات بالعربية — يفهمها المدير السوداني بدون تدريب تقني
 * (نطاق UX-4: الصلاحيات بشكل مفهوم). عرض فقط؛ أكواد الصلاحيات في
 * النظام (bookings.write، …) لا تتغير.
 */
const PERMISSION_LABELS: Record<string, string> = {
  // النطاقات
  "customers.read": "قراءة العملاء",
  "customers.write": "إضافة/تعديل العملاء",
  "routes.read": "قراءة الخطوط",
  "routes.write": "إدارة الخطوط",
  "fleet.read": "قراءة الأسطول",
  "fleet.write": "إدارة المركبات والسائقين",
  "trips.read": "قراءة الرحلات",
  "trips.write": "إنشاء/تعديل الرحلات",
  "bookings.read": "قراءة كل الحجوزات",
  "bookings.read.own": "قراءة حجوزاتي",
  "bookings.write": "إنشاء الحجوزات",
  "bookings.write.own": "إنشاء حجوزاتي",
  "tickets.read": "قراءة كل التذاكر",
  "tickets.read.own": "قراءة تذاكري",
  "tickets.write": "إصدار التذاكر",
  "tickets.write.own": "إصدار تذاكري",
  "payments.read": "قراءة كل المدفوعات",
  "payments.read.own": "قراءة مدفوعاتي",
  "payments.write": "تسجيل المدفوعات",
  "agents.read": "قراءة الوكلاء",
  "agents.read.own": "قراءة وكلائي",
  "agents.write": "إدارة الوكلاء",
  "expenses.read": "قراءة المصروفات",
  "expenses.write": "تسجيل المصروفات",
  "expenses.approve": "اعتماد المصروفات",
  "settlements.read": "قراءة التسويات",
  "settlements.read.own": "قراءة تسوياتي",
  "settlements.write": "تسجيل التسويات",
  "manifests.read": "قراءة المنفستو",
  "manifests.write": "إنشاء/قفل المنفستو",
  "reports.read": "التقارير",
  "accounting.read": "قراءة المحاسبة",
  "accounting.write": "تسجيل القيود",
  "accounting.post": "ترحيل القيود",
  "accounting.close": "إقفال الفترات",
  // نطاق المنصة
  "platform.admin": "إدارة المنصة (مشغّل Suda فقط)",
};

/** أي صلاحية غير معروفة: اجعلها مقروءة على الأقل (bookings.write.own → bookings.write.own). */
export function permissionLabel(code: string): string {
  if (PERMISSION_LABELS[code]) return PERMISSION_LABELS[code];
  // نجمة النطاق: "bookings.*" → "كل صلاحيات الحجوزات"
  if (code.endsWith(".*")) {
    const domain = PERMISSION_LABELS[`${code.slice(0, -2)}.read`] ?? PERMISSION_LABELS[`${code.slice(0, -2)}.write`];
    if (domain) return domain.replace("قراءة ", "كل صلاحيات ").replace("إضافة/تعديل ", "كل صلاحيات ");
  }
  if (code === "*") return "كل صلاحيات الشركة";
  return code;
}

export { PERMISSION_LABELS };
