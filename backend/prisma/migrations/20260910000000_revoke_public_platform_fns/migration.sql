-- Phase 2 (TD-016): سحب منح PUBLIC من دوال المنصة الحرجة.
--
-- لماذا: PostgreSQL يمنح PUBLIC/EXECUTE افتراضياً. أربع دوال كانت
-- لا تزال قابلة للتنفيذ من أي دور عبر منحة PUBLIC الضمنية:
--   * auth_user_by_id — يسرّب حالة اشتراك أي org لأي دور
--   * platform_expire_subscriptions — سحب اشتراكات (تخريب خدمة)
--   * platform_renew_subscription — تجديد اشتراك دون دفع (مُثبت
--     عملياً: ticketty_accounting_worker نفّذها ووصل لمنطق العمل)
--   * expire_subscriptions_sweep — غلاف التنفيذ للسحب
-- المنح الصريحة للدوال المعتمدة تبقى كما هي (ticketty_auth /
-- ticketty_app / ticketty_platform) — هذا سحب لـ PUBLIC فقط.
--
-- تعليق REVOKE الآخر في 20260908010000 كان صحيحاً لكن نسخة v3
-- من auth_user_by_id (20260909000000) أعادت الميلاد بمنحة PUBLIC
-- افتراضية جديدة لأن DROP+CREATE يعيد بناء الـ ACL من الصفر.

REVOKE EXECUTE ON FUNCTION ticketty_security.auth_user_by_id(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ticketty_security.platform_expire_subscriptions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ticketty_security.platform_renew_subscription(text, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ticketty_security.expire_subscriptions_sweep() FROM PUBLIC;
