-- ═══════════════════════════════════════════════════════════════════════════
-- PILOT BLOCKER-1: تهيئة محاسبية افتتاحية ذرّية مع تزويد الشركة الجديدة
-- ═══════════════════════════════════════════════════════════════════════════
-- المشكلة المثبتة (2026-09-08): تزويد tenant ينشئ (منظمة+فرع+دور+مالك)
-- لكن لا فترة مالية ولا دليل حسابات ولا سياسات قيود → أول بيع يُنشئ
-- PAYMENT_RECEIVED event يفشل الـ worker بـ «لا توجد فترة مالية مفتوحة
-- للحدث» بصمت (65 حدثاً عالقاً في dev عند الاكتشاف).
--
-- الحل (وفق موافقة المالك — نفس الـ domain rules، لا بيانات وهمية):
-- إعادة تعريف platform_provision_tenant لتُنشئ في نفس المعاملة (الذريّة
-- محفوظة — فشل أي جزء يفشل التزويد كله):
--   1) دليل الحسابات الافتتاحي — الحسابات الأربعة التي تستعملها
--      سياسات النظام الأربعة فعلياً (كل نوع حدث له debit/credit):
--        1010 الصندوق (ASSET)          — استلام/صرف النقد
--        2010 مستحقات الوكلاء (LIABILITY) — تسويات الوكلاء
--        4000 إيرادات النقل (REVENUE)
--        5010 مصروفات تشغيل (EXPENSE)
--      لا حسابات "للتزيين" — كل حساب تستهلكه سياسة أدناه.
--   2) دفتر يومية عام واحد (GJ) — كل السياسات تشير إليه.
--   3) فترة مالية OPEN للسنة الحالية (Jan-01..Dec-31) تغطي تاريخ
--      التشغيل الحالي (شرط الـ worker: startsAt <= event.createdAt
--      <= endsAt).
--   4) السياسات الأربع الافتراضية — نفس أزواج debit/credit التي
--      يطبقها resolveEventAmount/postBusinessEvent:
--        PAYMENT_RECEIVED:  1010 مدين / 4000 دائن (قبض نقدي مقابل إيراد)
--        REFUND_COMPLETED:  4000 مدين / 1010 دائن (عكس الإيراد وصرف النقد)
--        EXPENSE_APPROVED:  5010 مدين / 1010 دائن (مصروف مدفوع نقداً)
--        AGENT_SETTLEMENT:  2010 مدين / 1010 دائن (تسوية مستحقات وكيل)
--   5) العملة من المنظمة الافتراضية (SDG — كل النظام بها).
--
-- لماذا DROP FUNCTION وليس CREATE OR REPLACE:
--   التواقيع تختلف (عمودان جديدان في RETURNS). PostgreSQL يمنع تغيير
--   OUT type لدالة قائمة. DROP+CREATE داخل نفس الـ migration ذريّان
--   (كل migration يعمل في معاملة واحدة على Deploy).
--
-- ملاحظات معمارية:
--   * لا تغيير أي جدول/قيد/RLS/grant — بيانات + إعادة تعريف دالة
--     داخل معاملة الـ migration نفسها.
--   * المستهلك الوحيد للدالة: platform.service.ts (يُحدَّث في نفس
--     الـ commit — العمودان الجديدان اختياريان للاستهلاك).
--   * SECURITY DEFINER محفوظ كما هو — نفس البنية والامتيازات.
--   * idempotent بالبنية: التزويد مرفوض لو الـ slug مأخوذ، والحقول
--     الفريدة (org,code) (org,eventType) (org,year,period) تحمي
--     من الازدواج لو أعيد الاستدعاء نظرياً.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS ticketty_security.platform_provision_tenant(text, text, text, text, text, text, text, text, text, text);

CREATE FUNCTION ticketty_security.platform_provision_tenant(
  p_org_name text,
  p_org_slug text,
  p_org_phone text,
  p_branch_name text,
  p_branch_city text,
  p_owner_name text,
  p_owner_email text,
  p_owner_password_hash text,
  p_actor_id text,
  p_actor_org_id text
)
RETURNS TABLE (
  organization_id text,
  organization_slug text,
  organization_name text,
  branch_id text,
  branch_name text,
  branch_city text,
  role_id text,
  role_key text,
  owner_id text,
  owner_name text,
  owner_email text,
  audit_id text,
  fiscal_period_id text,
  accounting_ready boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org record;
  v_branch record;
  v_role record;
  v_owner record;
  v_audit record;
  v_period record;
  v_journal record;
  v_cash text;
  v_agent_payable text;
  v_revenue text;
  v_expense text;
  v_year int;
BEGIN
  -- حراس داخلية (الدفاع في العمق — الـ Prisma/service يفحص أولاً):
  IF p_org_slug IS NULL OR p_org_slug = '' THEN
    RAISE EXCEPTION 'PLATFORM_INVALID_SLUG'
      USING ERRCODE = 'check_violation';
  END IF;
  IF ticketty_security.platform_slug_taken(p_org_slug) THEN
    RAISE EXCEPTION 'PLATFORM_SLUG_TAKEN'
      USING ERRCODE = 'unique_violation';
  END IF;
  IF ticketty_security.platform_email_taken(p_owner_email) THEN
    RAISE EXCEPTION 'PLATFORM_EMAIL_TAKEN'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT o."id", o."slug", o."name" INTO v_org
  FROM public."organizations" o
  WHERE o."slug" = p_org_slug
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'PLATFORM_SLUG_TAKEN' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO public."organizations" ("id", "name", "slug", "phone", "createdAt", "updatedAt")
  VALUES (ticketty_security.platform_cuid(), p_org_name, p_org_slug, NULLIF(p_org_phone, ''), clock_timestamp(), clock_timestamp())
  RETURNING "id", "slug", "name" INTO v_org;

  INSERT INTO public."branches" ("id", "organizationId", "name", "city", "createdAt", "updatedAt")
  VALUES (ticketty_security.platform_cuid(), v_org.id, p_branch_name, p_branch_city, clock_timestamp(), clock_timestamp())
  RETURNING "id", "name", "city" INTO v_branch;

  INSERT INTO public."roles" ("id", "organizationId", "key", "nameAr", "nameEn", "permissions", "isSystem")
  VALUES (ticketty_security.platform_cuid(), v_org.id, 'OWNER', 'مالك النظام', 'Owner', ARRAY['*']::text[], true)
  RETURNING "id", "key" INTO v_role;

  -- الأدوار التشغيلية الست الباقية — نفس تعريفات prisma/seed.ts
  -- حرفياً (READ_ALL + الأدوار الموسعة) — لا اختراع. أول عميل
  -- حقيقي يحتاج إنشاء بائع/مالية/وكيل من أول يوم بلا seed يدوي.
  INSERT INTO public."roles" ("id", "organizationId", "key", "nameAr", "nameEn", "permissions", "isSystem")
  VALUES
    (ticketty_security.platform_cuid(), v_org.id, 'OPS_MANAGER', 'مدير العمليات', 'Operations Manager',
     ARRAY['customers.read','routes.read','fleet.read','trips.read','bookings.read','tickets.read','payments.read','agents.read','expenses.read','settlements.read','manifests.read','reports.read','accounting.read','routes.write','fleet.write','trips.write','manifests.write']::text[], true),
    (ticketty_security.platform_cuid(), v_org.id, 'FINANCE', 'المالية والمحاسبة', 'Finance / Accountant',
     ARRAY['customers.read','routes.read','fleet.read','trips.read','bookings.read','tickets.read','payments.read','agents.read','expenses.read','settlements.read','manifests.read','reports.read','accounting.read','payments.write','agents.write','expenses.write','expenses.approve','settlements.write','accounting.write','accounting.post','accounting.close']::text[], true),
    (ticketty_security.platform_cuid(), v_org.id, 'STATION_MANAGER', 'مدير المحطة', 'Station Manager',
     ARRAY['customers.read','routes.read','fleet.read','trips.read','bookings.read','tickets.read','payments.read','agents.read','expenses.read','settlements.read','manifests.read','reports.read','accounting.read','bookings.write','tickets.write','customers.write','payments.write','manifests.write']::text[], true),
    (ticketty_security.platform_cuid(), v_org.id, 'SELLER', 'البائع', 'Seller',
     ARRAY['trips.read','bookings.read','bookings.write','tickets.read','tickets.write','customers.read','customers.write','manifests.read','payments.read']::text[], true),
    (ticketty_security.platform_cuid(), v_org.id, 'AGENT', 'وكيل خارجي', 'External Agent',
     ARRAY['trips.read','bookings.read.own','bookings.write.own','tickets.read.own','tickets.write.own','customers.read','customers.write','payments.read.own','agents.read.own','settlements.read.own']::text[], true),
    (ticketty_security.platform_cuid(), v_org.id, 'VIEWER', 'مراجع / مدقق', 'Viewer / Auditor',
     ARRAY['customers.read','routes.read','fleet.read','trips.read','bookings.read','tickets.read','payments.read','agents.read','expenses.read','settlements.read','manifests.read','reports.read','accounting.read']::text[], true);

  INSERT INTO public."users" ("id", "organizationId", "branchId", "roleId", "name", "email", "passwordHash", "createdAt", "updatedAt")
  VALUES (ticketty_security.platform_cuid(), v_org.id, v_branch.id, v_role.id, p_owner_name, p_owner_email, p_owner_password_hash, clock_timestamp(), clock_timestamp())
  RETURNING "id", "name", "email" INTO v_owner;

  -- ═══════════════════════════════════════════════════════════════
  -- BLOCKER-1: التهيئة المحاسبية الافتتاحية (ذريّة — نفس المعاملة)
  -- أي فشل هنا يفشل التزويد كله: لا شركة نصف مهيأة أبداً.
  -- ═══════════════════════════════════════════════════════════════

  -- الحسابات الأربعة التي تستهلكها السياسات فعلياً (لا غير)
  INSERT INTO public."accounts" ("id", "organizationId", "code", "name", "type", "active", "createdAt", "updatedAt")
  VALUES
    (ticketty_security.platform_cuid(), v_org.id, '1010', 'الصندوق — النقد', 'ASSET'::"AccountType", true, clock_timestamp(), clock_timestamp()),
    (ticketty_security.platform_cuid(), v_org.id, '2010', 'مستحقات الوكلاء', 'LIABILITY'::"AccountType", true, clock_timestamp(), clock_timestamp()),
    (ticketty_security.platform_cuid(), v_org.id, '4000', 'إيرادات النقل', 'REVENUE'::"AccountType", true, clock_timestamp(), clock_timestamp()),
    (ticketty_security.platform_cuid(), v_org.id, '5010', 'مصروفات التشغيل', 'EXPENSE'::"AccountType", true, clock_timestamp(), clock_timestamp());

  SELECT
    max("id") FILTER (WHERE "code" = '1010'),
    max("id") FILTER (WHERE "code" = '2010'),
    max("id") FILTER (WHERE "code" = '4000'),
    max("id") FILTER (WHERE "code" = '5010')
  INTO v_cash, v_agent_payable, v_revenue, v_expense
  FROM public."accounts"
  WHERE "organizationId" = v_org.id AND "code" IN ('1010','2010','4000','5010');

  -- دفتر اليومية العام (واحد — كل السياسات تشير إليه)
  INSERT INTO public."journals" ("id", "organizationId", "code", "name", "createdAt")
  VALUES (ticketty_security.platform_cuid(), v_org.id, 'GJ', 'اليومية العامة', clock_timestamp())
  RETURNING "id" INTO v_journal;

  -- فترة مالية OPEN للسنة الحالية — تغطي تاريخ التشغيل (شرط الـ
  -- worker: startsAt <= event.createdAt <= endsAt)
  v_year := extract(year FROM clock_timestamp())::int;
  INSERT INTO public."fiscal_periods" ("id", "organizationId", "fiscalYear", "periodNumber", "startsAt", "endsAt", "status", "createdAt")
  VALUES (ticketty_security.platform_cuid(), v_org.id, v_year, 1,
          make_date(v_year, 1, 1), make_date(v_year, 12, 31), 'OPEN'::"FiscalPeriodStatus", clock_timestamp())
  RETURNING "id" INTO v_period;

  -- السياسات الأربع — نفس أزواج debit/credit التي يطبقها
  -- postBusinessEvent/resolveEventAmount على كل نوع حدث
  INSERT INTO public."accounting_policies" ("id", "organizationId", "eventType", "journalId", "debitAccountId", "creditAccountId", "active", "createdAt", "updatedAt")
  VALUES
    (ticketty_security.platform_cuid(), v_org.id, 'PAYMENT_RECEIVED'::"AccountingEventType", v_journal.id, v_cash, v_revenue, true, clock_timestamp(), clock_timestamp()),
    (ticketty_security.platform_cuid(), v_org.id, 'REFUND_COMPLETED'::"AccountingEventType", v_journal.id, v_revenue, v_cash, true, clock_timestamp(), clock_timestamp()),
    (ticketty_security.platform_cuid(), v_org.id, 'EXPENSE_APPROVED'::"AccountingEventType", v_journal.id, v_expense, v_cash, true, clock_timestamp(), clock_timestamp()),
    (ticketty_security.platform_cuid(), v_org.id, 'AGENT_SETTLEMENT'::"AccountingEventType", v_journal.id, v_agent_payable, v_cash, true, clock_timestamp(), clock_timestamp());

  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO public."audit_logs" ("id", "organizationId", "userId", "action", "entity", "entityId", "meta")
  VALUES (
    ticketty_security.platform_cuid(),
    p_actor_org_id,
    p_actor_id,
    'PLATFORM_TENANT_PROVISIONED',
    'Organization',
    v_org.id,
    jsonb_build_object(
      'newOrganizationSlug', p_org_slug,
      'newOrganizationName', p_org_name,
      'ownerEmail', p_owner_email,
      'ownerUserId', v_owner.id,
      'accountingReady', true,
      'fiscalPeriodId', v_period.id
    )
  )
  RETURNING "id" INTO v_audit;

  RETURN QUERY
    SELECT
      v_org.id, v_org.slug, v_org.name,
      v_branch.id, v_branch.name, v_branch.city,
      v_role.id, v_role.key,
      v_owner.id, v_owner.name, v_owner.email,
      v_audit.id,
      v_period.id,
      true;
END
$$;

-- المنح — نفس الدور (ticketty_platform) كما كانت:
GRANT EXECUTE ON FUNCTION ticketty_security.platform_provision_tenant(text, text, text, text, text, text, text, text, text, text) TO ticketty_platform;

-- حصريّة المنح: الدالة SECURITY DEFINER — PUBLIC يجب ألا ينفذها
-- (CREATE FUNCTION يمنح PUBLIC افتراضياً؛ invariant fn-public-grant
-- يفحص هذا بالضبط — نفس النمط الذي رسّخه 20260910000000).
REVOKE ALL ON FUNCTION ticketty_security.platform_provision_tenant(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
