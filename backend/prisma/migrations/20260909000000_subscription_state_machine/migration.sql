-- ─────────────────────────────────────────────────────────────
-- Subscription State Machine & Enforcement (2026-09-09)
-- Phase 1 of Pre-Launch Hardening (approved Engineering Contract §1)
--
-- الحالة قبل هذه الهجرة:
--  • PAST_DUE حالة معرّفة في السطر التعليقي للنموذج لكن لا
--    يضعها أي كود — لا يوجد مفهوم مهلة سماح (grace).
--  • الانتهاء يدوي فقط (زر المشغّل) — لا sweep دوري.
--  • platform_renew_subscription يقبل ONLY
--    (TRIALING, ACTIVE, PAST_DUE) — أي لا يمكن تجديد اشتراك
--    EXPIRED/CANCELLED أصلاً (ثغرة دورة حياة).
--  • لا يوجد أي enforcement للاشتراك في مسارات الطلبات.
--
-- هذه الهجرة (دوال فقط — صفر جداول/أعمدة/backfill):
--  1) auth_user_by_id v3: عمودان إضافيان لقراءة الاشتراك في
--     نفس استعلام إعادة قراءة المصادقة (لا استعلام إضافي، لا
--     مصدر سلطة ثانٍ). LEFT JOIN LATERAL لآخر صف اشتراك بأي
--     حالة — لو فُلترت بالحالات النشطة لعاد NULL للمنتهية
--     وفتح ذلك باب fail-open عند الـ guard.
--  2) platform_expire_subscriptions v2: آلة الحالات:
--       TRIALING  منتهية  → EXPIRED   (بلا سماح — مجاني)
--       ACTIVE    منتهية  → PAST_DUE  (مهلة سداد)
--       PAST_DUE  تجاوزت 7 أيام → EXPIRED
--     أحداث system_events لكل انتقال مع dedup على
--     (subscriptionId, transition) — التكرار no-op.
--  3) platform_renew_subscription v2: يقبل التجديد من أي حالة
--     (التجديد هو مسار العمل الصريح الذي يبرر CANCELLED→ACTIVE
--     وفق عقد الهندسة §6) ويمسح cancelledAt.
--  4) expire_subscriptions_sweep(): مدخل worker بلا معاملات —
--     SECURITY DEFINER، قاعدة صرفة (currentPeriodEnd < now())
--     لا تقبل توجيهاً، GRANT لـ ticketty_app فقط.
--
-- ثوابت غير قابلة للنقل إلى env عمداً: 7 أيام سماح hardcode —
-- لو كانت الدالة تقبل معاملاً لصار قابلاً للتوجيه من المستدعي.
--
-- لا RLS، لا grants جداول جديدة، لا مساس بـ protected core.
-- ─────────────────────────────────────────────────────────────

-- 1) auth_user_by_id v3 — إضافة حقلي الاشتراك -------------------
-- DROP+CREATE إلزامي (تغير أعمدة الإرجاع) — نفس النمط الناجح
-- في هجرة password_rotation_sessions (20260908050000).
DROP FUNCTION IF EXISTS ticketty_security.auth_user_by_id(text);

CREATE FUNCTION ticketty_security.auth_user_by_id(p_user_id text)
RETURNS TABLE (
  user_id text,
  organization_id text,
  branch_id text,
  user_name text,
  user_email text,
  user_active boolean,
  role_key text,
  role_permissions text[],
  organization_active boolean,
  password_changed_at timestamp(3),
  subscription_status text,
  subscription_period_end timestamp(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    u."id", u."organizationId", u."branchId", u."name", u."email",
    u."active", r."key", r."permissions", o."active", u."passwordChangedAt",
    sub.status, sub."currentPeriodEnd"
  FROM public."users" u
  JOIN public."roles" r ON r."id" = u."roleId"
  JOIN public."organizations" o ON o."id" = u."organizationId"
  LEFT JOIN LATERAL (
    -- آخر صف اشتراك بأي حالة (بلا فلتر حالة!): منظمة منتهية
    -- ترجع EXPIRED لا NULL — وقرار "بلا اشتراك إطلاقاً = سماح"
    -- يبقى نافذة pre-provisioning موثقة ومقصودة فقط.
    SELECT s."status", s."currentPeriodEnd"
    FROM public."subscriptions" s
    WHERE s."organizationId" = u."organizationId"
    ORDER BY s."startedAt" DESC
    LIMIT 1
  ) sub ON true
  WHERE u."id" = p_user_id
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION ticketty_security.auth_user_by_id(text) TO ticketty_auth;

-- 2) platform_expire_subscriptions v2 — آلة الحالات ---------------
DROP FUNCTION IF EXISTS ticketty_security.platform_expire_subscriptions();

CREATE FUNCTION ticketty_security.platform_expire_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_due_count integer;
  v_expired_count integer;
  v_trial_count integer;
  r record;
BEGIN
  -- ACTIVE منتهية الفترة → PAST_DUE (مهلة سداد 7 أيام، وصول كامل)
  UPDATE public."subscriptions" AS s
  SET "status" = 'PAST_DUE', "updatedAt" = clock_timestamp()
  WHERE s."status" = 'ACTIVE'
    AND s."currentPeriodEnd" < clock_timestamp();
  GET DIAGNOSTICS v_due_count = ROW_COUNT;

  -- PAST_DUE تجاوزت مهلة السماح (7 أيام من نهاية الفترة) → EXPIRED
  UPDATE public."subscriptions" AS s
  SET "status" = 'EXPIRED', "updatedAt" = clock_timestamp()
  WHERE s."status" = 'PAST_DUE'
    AND s."currentPeriodEnd" < clock_timestamp() - interval '7 days';
  GET DIAGNOSTICS v_expired_count = ROW_COUNT;

  -- TRIALING منتهية → EXPIRED مباشرة (بلا سماح — التجربة مجانية)
  UPDATE public."subscriptions" AS s
  SET "status" = 'EXPIRED', "updatedAt" = clock_timestamp()
  WHERE s."status" = 'TRIALING'
    AND s."currentPeriodEnd" < clock_timestamp();
  GET DIAGNOSTICS v_trial_count = ROW_COUNT;

  -- أحداث المنصة لكل انتقال — dedup على (subscriptionId, transition)
  -- حتى لا يكرر sweep متكرر الأحداث أبداً.
  FOR r IN
    SELECT s."id", s."organizationId", s."planKey", 'PAST_DUE' AS transition
    FROM public."subscriptions" s
    WHERE s."status" = 'PAST_DUE'
      AND s."updatedAt" >= clock_timestamp() - interval '1 minute'
      AND NOT EXISTS (
        SELECT 1 FROM public."system_events" e
        WHERE e."category" = 'SUBSCRIPTION'
          AND e."context" ->> 'subscriptionId' = s."id"
          AND e."context" ->> 'transition' = 'PAST_DUE'
      )
    UNION ALL
    SELECT s."id", s."organizationId", s."planKey", 'EXPIRED' AS transition
    FROM public."subscriptions" s
    WHERE s."status" = 'EXPIRED'
      AND s."updatedAt" >= clock_timestamp() - interval '1 minute'
      AND NOT EXISTS (
        SELECT 1 FROM public."system_events" e
        WHERE e."category" = 'SUBSCRIPTION'
          AND e."context" ->> 'subscriptionId' = s."id"
          AND e."context" ->> 'transition' = 'EXPIRED'
      )
  LOOP
    INSERT INTO public."system_events" ("id", "level", "category", "message", "context")
    VALUES (
      ticketty_security.platform_cuid(),
      'WARN',
      'SUBSCRIPTION',
      CASE r.transition
        WHEN 'PAST_DUE' THEN 'انتهت فترة اشتراك مدفوعة — مهلة سداد 7 أيام'
        ELSE 'انتهى اشتراك شركة — متابعة السداد'
      END,
      jsonb_build_object(
        'subscriptionId', r."id",
        'organizationId', r."organizationId",
        'planKey', r."planKey",
        'transition', r.transition
      )
    );
  END LOOP;

  RETURN v_due_count + v_expired_count + v_trial_count;
END
$$;

GRANT EXECUTE ON FUNCTION ticketty_security.platform_expire_subscriptions() TO ticketty_platform;

-- 3) platform_renew_subscription v2 — تجديد من أي حالة ----------
-- إصلاح ثغرة دورة حياة: IN clause القديمة (TRIALING/ACTIVE/
-- PAST_DUE) كانت تجعل تجديد اشتراك EXPIRED/CANCELLED مستحيلاً.
-- التجديد هو مسار العمل الصريح الذي يبرر CANCELLED→ACTIVE
-- (عقد الهندسة §6).
DROP FUNCTION IF EXISTS ticketty_security.platform_renew_subscription(text, integer, text, text);

CREATE FUNCTION ticketty_security.platform_renew_subscription(
  p_org_id text,
  p_months integer, -- 1 شهري | 12 سنوي
  p_actor_id text,
  p_actor_org_id text
)
RETURNS TABLE (
  subscription_id text,
  plan_key text,
  price_sdg integer,
  status text,
  current_period_end timestamp(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sub record;
  v_price integer;
  v_prev_status text;
  v_sub_id text;
  v_plan text;
  v_price_out integer;
  v_status_out text;
  v_end_out timestamp(3);
BEGIN
  SELECT * INTO v_sub
  FROM public."subscriptions" s
  WHERE s."organizationId" = p_org_id
  ORDER BY s."startedAt" DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLATFORM_NO_ACTIVE_SUBSCRIPTION'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_months NOT IN (1, 12) THEN
    RAISE EXCEPTION 'PLATFORM_INVALID_PLAN'
      USING ERRCODE = 'check_violation';
  END IF;

  v_price := CASE p_months WHEN 1 THEN 199000 ELSE 2388000 END;
  v_prev_status := v_sub."status";

  UPDATE public."subscriptions" AS s2
  SET
    "planKey" = CASE p_months WHEN 1 THEN 'MONTHLY' ELSE 'YEARLY' END,
    "priceSdg" = v_price,
    "status" = 'ACTIVE',
    "currentPeriodEnd" = GREATEST(s2."currentPeriodEnd", clock_timestamp()) + make_interval(months => p_months),
    "cancelledAt" = NULL,
    "updatedAt" = clock_timestamp()
  WHERE s2."id" = v_sub.id
  RETURNING s2."id", s2."planKey", s2."priceSdg", s2."status", s2."currentPeriodEnd"
    INTO v_sub_id, v_plan, v_price_out, v_status_out, v_end_out;

  subscription_id := v_sub_id;
  plan_key := v_plan;
  price_sdg := v_price_out;
  status := v_status_out;
  current_period_end := v_end_out;
  RETURN NEXT;

  INSERT INTO public."audit_logs" ("id", "organizationId", "userId", "action", "entity", "entityId", "meta")
  VALUES (
    ticketty_security.platform_cuid(),
    p_actor_org_id,
    p_actor_id,
    'PLATFORM_SUBSCRIPTION_RENEWED',
    'Organization',
    p_org_id,
    jsonb_build_object(
      'months', p_months,
      'priceSdg', v_price,
      'previousStatus', v_prev_status
    )
  );
END
$$;

GRANT EXECUTE ON FUNCTION ticketty_security.platform_renew_subscription(text, integer, text, text) TO ticketty_platform;

-- 4) مدخل الـ sweep — بلا معاملات، قاعدة صرفة -------------------
-- wrapper حول نفس منطق expire (DRY: زر المشغّل اليدوي وworker
-- الدوري يشتركان في سلوك واحد). بلا معاملات = لا قابلية توجيه.
-- المنح: ticketty_app فقط — لا يتسع لأي حق على الجدول نفسه.
CREATE FUNCTION ticketty_security.expire_subscriptions_sweep()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT ticketty_security.platform_expire_subscriptions() INTO v_count;
  RETURN v_count;
END
$$;

GRANT EXECUTE ON FUNCTION ticketty_security.expire_subscriptions_sweep() TO ticketty_app;
