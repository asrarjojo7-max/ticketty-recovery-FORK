-- ─────────────────────────────────────────────────────────────
-- Platform Subscriptions & Operations Boundary (2026-09-08b)
--
-- يوسّع حد الثقة القائم (ticketty_platform) ليشمل:
--  1) جدول اشتراكات المنصة: subscription لكل Tenant
--     (تجربة مجانية 30 يوماً / شهري 199,000 ج.س / سنوي)
--  2) دوال دورة حياة المنظمة: تعليق/تفعيل/إزالة (بقيد أمان:
--     لا تُمس منظمة المشغّل نفسها أبداً، والإزالة مسار إدارة
--     بيانات مدروس — جدولة وليس حذفاً فورياً)
--  3) جدول أحداث النظام (system_events): إشعارات المشغّل —
--     أخطاء وتنبيهات وأداء، بدون أي بيانات عملاء حساسة
--  4) دوال مراقبة: صحة النظام لحظياً، تقارير استخدام لكل
--     شركة (أرقام تجارية فقط — أعداد، لا بيانات شخصية)
--
-- نفس مبادئ الحدود السابق: SECURITY DEFINER محددة النطاق،
-- search_path مقفلة، منح EXECUTE لـ ticketty_platform فقط.
-- ─────────────────────────────────────────────────────────────

-- 1) جدول الاشتراكات (منظمة واحدة ← اشتراك نشط واحد) -----------
CREATE TABLE "subscriptions" (
  "id" text NOT NULL,
  "organizationId" text NOT NULL,
  "planKey" text NOT NULL, -- TRIAL | MONTHLY | YEARLY
  "priceSdg" integer NOT NULL DEFAULT 0, -- بالقروش؟ لا: بالجنيه (199000)
  "currency" text NOT NULL DEFAULT 'SDG',
  "status" text NOT NULL DEFAULT 'TRIALING', -- TRIALING | ACTIVE | PAST_DUE | EXPIRED | CANCELLED
  "startedAt" timestamp(3) NOT NULL,
  "currentPeriodEnd" timestamp(3) NOT NULL,
  "cancelledAt" timestamp(3),
  "notes" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_org_active_idx"
  ON "subscriptions" ("organizationId")
  WHERE "status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE');

CREATE INDEX "subscriptions_status_period_idx"
  ON "subscriptions" ("status", "currentPeriodEnd");

COMMENT ON TABLE "subscriptions" IS 'اشتراكات المنصة B2B — إدارة علاقة Suda-Technologies بعملائها';

-- الاشتراكات بيانات منصة (وليست بيانات Tenant) — بدون RLS
-- تنظيمي؛ الوصول عبر دوال المنصة فقط (GRANT انتقائي أدناه).
GRANT SELECT ON "subscriptions" TO ticketty_platform;

-- 2) جدول أحداث النظام (إشعارات المشغّل) ------------------------
-- أحداث تشغيلية/أمان مُجمّعة: لا بيانات عملاء حساسة — نص
-- عام + سياق JSON محدود. مثال: worker crash، فشل محاسبة،
-- انتهاء اشتراك، خطأ تسجيل دخول متكرر.
CREATE TABLE "system_events" (
  "id" text NOT NULL,
  "level" text NOT NULL DEFAULT 'INFO', -- INFO | WARN | ERROR
  "category" text NOT NULL, -- SUBSCRIPTION | ACCOUNTING | AUTH | SYSTEM | TENANT
  "message" text NOT NULL,
  "context" jsonb,
  "acknowledgedAt" timestamp(3),
  "acknowledgedById" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_events_level_created_idx"
  ON "system_events" ("level", "createdAt" DESC);

CREATE INDEX "system_events_category_created_idx"
  ON "system_events" ("category", "createdAt" DESC);

COMMENT ON TABLE "system_events" IS 'أحداث نظام المنصة — إشعارات المشغّل (لا بيانات عملاء حساسة)';

GRANT SELECT, UPDATE ON "system_events" TO ticketty_platform;

-- 3) دوال دورة الحياة -------------------------------------------

-- تعليق Tenant: يمنع دخول مستخدميه فوراً (auth_user_by_* يفحص
-- organization_active). لا يُمس بيانات — تعليق فقط.
CREATE OR REPLACE FUNCTION ticketty_security.platform_suspend_tenant(
  p_org_id text,
  p_reason text,
  p_actor_id text,
  p_actor_org_id text
)
RETURNS TABLE (organization_id text, active boolean, suspended_at timestamp(3))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org_id text;
  v_active boolean;
  v_at timestamp(3);
BEGIN
  -- لا يجوز تعليق منظمة المشغّل نفسها (سيف يقطع يد حامله)
  IF EXISTS (
    SELECT 1 FROM public."organizations" o
    WHERE o."slug" = 'ticketty' AND o."id" = p_org_id
  ) THEN
    RAISE EXCEPTION 'PLATFORM_OPERATOR_PROTECTED'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public."organizations" AS o
  SET "active" = false, "updatedAt" = clock_timestamp()
  WHERE o."id" = p_org_id AND o."active" = true
  RETURNING o."id", o."active", o."updatedAt"
    INTO v_org_id, v_active, v_at;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_TENANT_NOT_FOUND_OR_ALREADY_SUSPENDED'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public."system_events" ("id", "level", "category", "message", "context")
  VALUES (
    ticketty_security.platform_cuid(), 'WARN', 'TENANT',
    'تم تعليق شركة من المنصة',
    jsonb_build_object('organizationId', p_org_id, 'reason', p_reason, 'by', p_actor_id)
  );

  INSERT INTO public."audit_logs" ("id", "organizationId", "userId", "action", "entity", "entityId", "meta")
  VALUES (
    ticketty_security.platform_cuid(),
    p_actor_org_id,
    p_actor_id,
    'PLATFORM_TENANT_SUSPENDED',
    'Organization',
    p_org_id,
    jsonb_build_object('reason', p_reason)
  );

  -- RETURNS TABLE تتطلب RETURN NEXT صريحاً — الإسناد وحده لا يُرجع صفاً
  organization_id := v_org_id;
  active := v_active;
  suspended_at := v_at;
  RETURN NEXT;
END
$$;

CREATE OR REPLACE FUNCTION ticketty_security.platform_reactivate_tenant(
  p_org_id text,
  p_actor_id text,
  p_actor_org_id text
)
RETURNS TABLE (organization_id text, active boolean, reactivated_at timestamp(3))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org_id text;
  v_active boolean;
  v_at timestamp(3);
BEGIN
  UPDATE public."organizations" AS o
  SET "active" = true, "updatedAt" = clock_timestamp()
  WHERE o."id" = p_org_id AND o."active" = false
  RETURNING o."id", o."active", o."updatedAt"
    INTO v_org_id, v_active, v_at;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_TENANT_NOT_FOUND_OR_ALREADY_ACTIVE'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public."system_events" ("id", "level", "category", "message", "context")
  VALUES (
    ticketty_security.platform_cuid(), 'INFO', 'TENANT',
    'تم إعادة تفعيل شركة على المنصة',
    jsonb_build_object('organizationId', p_org_id, 'by', p_actor_id)
  );

  INSERT INTO public."audit_logs" ("id", "organizationId", "userId", "action", "entity", "entityId", "meta")
  VALUES (
    ticketty_security.platform_cuid(),
    p_actor_org_id,
    p_actor_id,
    'PLATFORM_TENANT_REACTIVATED',
    'Organization',
    p_org_id,
    jsonb_build_object()::jsonb
  );

  organization_id := v_org_id;
  active := v_active;
  reactivated_at := v_at;
  RETURN NEXT;
END
$$;

-- 4) إدارة الاشتراك ---------------------------------------------
-- يبدأ اشتراكاً جديداً: تجربة (30 يوماً مجاناً) أو مدفوعاً.
-- أي اشتراك سابق نشط يُختم CANCELLED (سجل تاريخي سليم).
CREATE OR REPLACE FUNCTION ticketty_security.platform_set_subscription(
  p_org_id text,
  p_plan_key text, -- TRIAL | MONTHLY | YEARLY
  p_price_sdg integer,
  p_period_months integer,
  p_notes text,
  p_actor_id text,
  p_actor_org_id text
)
RETURNS TABLE (
  subscription_id text,
  organization_id text,
  plan_key text,
  price_sdg integer,
  status text,
  started_at timestamp(3),
  current_period_end timestamp(3)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_plan text;
  v_price integer;
  v_period integer;
  v_trial_days integer;
BEGIN
  IF p_plan_key NOT IN ('TRIAL', 'MONTHLY', 'YEARLY') THEN
    RAISE EXCEPTION 'PLATFORM_INVALID_PLAN'
      USING ERRCODE = 'check_violation';
  END IF;

  -- الأسعار المعتمدة (سعر المنصة) — لا يثق الخادم بالمدخلات
  CASE p_plan_key
    WHEN 'TRIAL'   THEN v_price := 0;        v_period := 0;  v_trial_days := 30;
    WHEN 'MONTHLY' THEN v_price := 199000;   v_period := 1;  v_trial_days := 0;
    WHEN 'YEARLY'  THEN v_price := 2388000;  v_period := 12; v_trial_days := 0;
  END CASE;
  -- السعر في قاعدة البيانات دائماً — المدخل فقط تحقق (دفاع عمق)
  IF p_price_sdg IS NOT NULL AND p_price_sdg <> v_price THEN
    RAISE EXCEPTION 'PLATFORM_INVALID_PLAN'
      USING ERRCODE = 'check_violation';
  END IF;

  -- تحديث الاشتراكات النشطة السابقة → CANCELLED (تاريخ سليم)
  UPDATE public."subscriptions" AS s
  SET "status" = 'CANCELLED',
      "cancelledAt" = clock_timestamp(),
      "updatedAt" = clock_timestamp()
  WHERE s."organizationId" = p_org_id
    AND s."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE');

  IF v_trial_days > 0 THEN
    INSERT INTO public."subscriptions"
      ("id", "organizationId", "planKey", "priceSdg", "currency", "status", "startedAt", "currentPeriodEnd", "notes", "createdAt", "updatedAt")
    VALUES (
      ticketty_security.platform_cuid(), p_org_id, 'TRIAL', 0, 'SDG', 'TRIALING',
      clock_timestamp(), clock_timestamp() + make_interval(days => v_trial_days),
      p_notes, clock_timestamp(), clock_timestamp()
    );
  ELSE
    INSERT INTO public."subscriptions"
      ("id", "organizationId", "planKey", "priceSdg", "currency", "status", "startedAt", "currentPeriodEnd", "notes", "createdAt", "updatedAt")
    VALUES (
      ticketty_security.platform_cuid(), p_org_id, p_plan_key, v_price, 'SDG', 'ACTIVE',
      clock_timestamp(), clock_timestamp() + make_interval(months => v_period),
      p_notes, clock_timestamp(), clock_timestamp()
    );
  END IF;

  INSERT INTO public."audit_logs" ("id", "organizationId", "userId", "action", "entity", "entityId", "meta")
  VALUES (
    ticketty_security.platform_cuid(),
    p_actor_org_id,
    p_actor_id,
    'PLATFORM_SUBSCRIPTION_SET',
    'Organization',
    p_org_id,
    jsonb_build_object('planKey', p_plan_key, 'priceSdg', v_price, 'periodMonths', v_period)
  );

  RETURN QUERY
  SELECT s."id", s."organizationId", s."planKey", s."priceSdg", s."status", s."startedAt", s."currentPeriodEnd"
  FROM public."subscriptions" s
  WHERE s."organizationId" = p_org_id AND s."status" IN ('TRIALING', 'ACTIVE')
  ORDER BY s."startedAt" DESC
  LIMIT 1;
  -- ملاحظة: أسماء أعمدة RETURNS TABLE تحجب أسماء الأعمدة المؤهلة أعلاه فقط
  -- عند عدم التأهيل — التأهيل s."..." يجعلها غير غامضة.
END
$$;

-- تجديد الاشتراك المدفوع: يمتد من نهاية الفترة الحالية (وليس
-- من الآن) — عدالة العقد.
CREATE OR REPLACE FUNCTION ticketty_security.platform_renew_subscription(
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
  v_sub_id text;
  v_plan text;
  v_price_out integer;
  v_status_out text;
  v_end_out timestamp(3);
BEGIN
  SELECT * INTO v_sub
  FROM public."subscriptions" s
  WHERE s."organizationId" = p_org_id
    AND s."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE')
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

  UPDATE public."subscriptions" AS s2
  SET
    "planKey" = CASE p_months WHEN 1 THEN 'MONTHLY' ELSE 'YEARLY' END,
    "priceSdg" = v_price,
    "status" = 'ACTIVE',
    "currentPeriodEnd" = GREATEST(s2."currentPeriodEnd", clock_timestamp()) + make_interval(months => p_months),
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
    jsonb_build_object('months', p_months, 'priceSdg', v_price)
  );
END
$$;

-- 5) نضج الاشتراكات (يستدعيه الـ worker دورياً) -------------------
-- ينقل TRIALING/ACTIVE منتهي الفترة → EXPIRED، ويولّد حدث
-- تنبيه. لا يعلّق المنظمة تلقائياً — قرار المشغّل البشري
-- (مرونة علاقة البيع: مهلة سداد متوقعة).
CREATE OR REPLACE FUNCTION ticketty_security.platform_expire_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_count integer;
  r record;
BEGIN
  UPDATE public."subscriptions" AS s
  SET "status" = 'EXPIRED', "updatedAt" = clock_timestamp()
  WHERE s."status" IN ('TRIALING', 'ACTIVE')
    AND s."currentPeriodEnd" < clock_timestamp();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    -- نولّد الحدث للاشتراكات التي نضجت في هذه الدورة تحديداً: علامة
    -- temporary status marker أفضل من نافذة زمنية على currentPeriodEnd
    -- (الذي قد يكون قديماً إذا كان الانتهاء منذ أيام).
    FOR r IN
      SELECT s."id", s."organizationId", s."planKey"
      FROM public."subscriptions" s
      WHERE s."status" = 'EXPIRED'
        AND s."updatedAt" >= clock_timestamp() - interval '1 minute'
        AND NOT EXISTS (
          SELECT 1 FROM public."system_events" e
          WHERE e."category" = 'SUBSCRIPTION'
            AND e."context" ->> 'subscriptionId' = s."id"
        )
    LOOP
      INSERT INTO public."system_events" ("id", "level", "category", "message", "context")
      VALUES (
        ticketty_security.platform_cuid(), 'WARN', 'SUBSCRIPTION',
        'انتهت فترة اشتراك شركة — متابعة السداد',
        jsonb_build_object('subscriptionId', r."id", 'organizationId', r."organizationId", 'planKey', r."planKey")
      );
    END LOOP;
  END IF;

  RETURN v_count;
END
$$;

-- 6) قائمة Tenants موسّعة (اشتراك + استخدام) ---------------------
CREATE OR REPLACE FUNCTION ticketty_security.platform_list_tenants_v2(
  p_search text
)
RETURNS TABLE (
  id text,
  name text,
  slug text,
  active boolean,
  created_at timestamp(3),
  users_count bigint,
  branches_count bigint,
  trips_count bigint,
  tickets_count bigint,
  plan_key text,
  subscription_status text,
  subscription_end timestamp(3),
  price_sdg integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    o."id", o."name", o."slug", o."active", o."createdAt",
    (SELECT count(*) FROM public."users" u WHERE u."organizationId" = o."id"),
    (SELECT count(*) FROM public."branches" b WHERE b."organizationId" = o."id"),
    (SELECT count(*) FROM public."trips" t WHERE t."organizationId" = o."id"),
    (SELECT count(*) FROM public."tickets" t WHERE t."organizationId" = o."id"),
    s."planKey",
    s."status",
    s."currentPeriodEnd",
    s."priceSdg"
  FROM public."organizations" o
  LEFT JOIN public."subscriptions" s
    ON s."organizationId" = o."id"
   AND s."status" IN ('TRIALING', 'ACTIVE', 'PAST_DUE')
  WHERE p_search IS NULL
     OR o."name" ILIKE '%' || p_search || '%'
     OR o."slug" ILIKE '%' || p_search || '%'
  ORDER BY o."createdAt" DESC
$$;

-- 7) تقرير استخدام Tenant (أرقام تجارية فقط — لا بيانات أشخاص) --
CREATE OR REPLACE FUNCTION ticketty_security.platform_tenant_report(
  p_org_id text,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  organization_id text,
  organization_name text,
  trips_total bigint,
  trips_recent bigint,
  tickets_total bigint,
  tickets_recent bigint,
  revenue_total_sdg numeric(14, 2),
  revenue_recent_sdg numeric(14, 2),
  active_users bigint,
  branches bigint,
  buses bigint,
  last_activity timestamp(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    o."id", o."name",
    (SELECT count(*) FROM public."trips" t WHERE t."organizationId" = o."id"),
    (SELECT count(*) FROM public."trips" t WHERE t."organizationId" = o."id"
       AND t."createdAt" >= clock_timestamp() - make_interval(days => p_days)),
    (SELECT count(*) FROM public."tickets" t WHERE t."organizationId" = o."id"),
    (SELECT count(*) FROM public."tickets" t WHERE t."organizationId" = o."id"
       AND t."createdAt" >= clock_timestamp() - make_interval(days => p_days)),
    (SELECT coalesce(sum(t."fare"), 0) FROM public."tickets" t WHERE t."organizationId" = o."id"),
    (SELECT coalesce(sum(t."fare"), 0) FROM public."tickets" t
       WHERE t."organizationId" = o."id"
         AND t."createdAt" >= clock_timestamp() - make_interval(days => p_days)),
    (SELECT count(*) FROM public."users" u WHERE u."organizationId" = o."id" AND u."active"),
    (SELECT count(*) FROM public."branches" b WHERE b."organizationId" = o."id"),
    (SELECT count(*) FROM public."buses" b WHERE b."organizationId" = o."id"),
    (SELECT max(u."lastLoginAt") FROM public."users" u WHERE u."organizationId" = o."id")
  FROM public."organizations" o
  WHERE o."id" = p_org_id
$$;

-- 8) أحداث النظام (قائمة قراءة المشغّل) -------------------------
CREATE OR REPLACE FUNCTION ticketty_security.platform_list_events(
  p_level text, -- NULL = الكل
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id text,
  level text,
  category text,
  message text,
  context jsonb,
  acknowledged_at timestamp(3),
  created_at timestamp(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT e."id", e."level", e."category", e."message", e."context",
         e."acknowledgedAt", e."createdAt"
  FROM public."system_events" e
  WHERE p_level IS NULL OR e."level" = p_level
  ORDER BY e."createdAt" DESC
  LIMIT least(greatest(p_limit, 1), 200)
$$;

-- إقرار حدث (تعليم "قرأتُه") — يخفيه من قائمة غير المقروء
CREATE OR REPLACE FUNCTION ticketty_security.platform_ack_event(
  p_event_id text,
  p_actor_id text
)
RETURNS TABLE (id text, acknowledged_at timestamp(3))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event_id text;
  v_ack_at timestamp(3);
BEGIN
  UPDATE public."system_events" AS e
  SET "acknowledgedAt" = clock_timestamp(), "acknowledgedById" = p_actor_id
  WHERE e."id" = p_event_id AND e."acknowledgedAt" IS NULL
  RETURNING e."id", e."acknowledgedAt" INTO v_event_id, v_ack_at;

  id := v_event_id;
  acknowledged_at := v_ack_at;
  RETURN NEXT;

  IF id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_EVENT_NOT_FOUND'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- 9) صحة النظام لحظياً (لوحة المشغّل) ----------------------------
CREATE OR REPLACE FUNCTION ticketty_security.platform_health()
RETURNS TABLE (
  tenants_total bigint,
  tenants_active bigint,
  tenants_suspended bigint,
  trials_running bigint,
  trials_expiring_soon bigint,
  subscriptions_active bigint,
  subscriptions_expired bigint,
  pending_accounting_events bigint,
  unacknowledged_events bigint,
  database_size text,
  app_version text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    (SELECT count(*) FROM public."organizations" o WHERE o."slug" <> 'ticketty'),
    (SELECT count(*) FROM public."organizations" o WHERE o."slug" <> 'ticketty' AND o."active"),
    (SELECT count(*) FROM public."organizations" o WHERE o."slug" <> 'ticketty' AND NOT o."active"),
    (SELECT count(*) FROM public."subscriptions" s WHERE s."status" = 'TRIALING'),
    (SELECT count(*) FROM public."subscriptions" s
       WHERE s."status" = 'TRIALING'
         AND s."currentPeriodEnd" BETWEEN clock_timestamp() AND clock_timestamp() + interval '7 days'),
    (SELECT count(*) FROM public."subscriptions" s WHERE s."status" = 'ACTIVE'),
    (SELECT count(*) FROM public."subscriptions" s WHERE s."status" = 'EXPIRED'),
    (SELECT count(*) FROM public."accounting_events" a WHERE a."status" = 'PENDING'),
    (SELECT count(*) FROM public."system_events" e WHERE e."acknowledgedAt" IS NULL AND e."level" IN ('WARN', 'ERROR')),
    pg_size_pretty(pg_database_size(current_database())),
    '1.0'
$$;

-- 10) المنح — ticketty_platform فقط -------------------------------
-- PostgreSQL يمنح PUBLIC/EXECUTE افتراضياً للدوال — نسحبه صراحة
-- (نفس نمط auth boundary). لا أحد غير ticketty_platform يستطيع
-- استدعاء أي دالة منصة حتى لو عُيّن دور آخر خطأً.
REVOKE ALL ON FUNCTION
  ticketty_security.platform_cuid(),
  ticketty_security.platform_slug_taken(text),
  ticketty_security.platform_email_taken(text),
  ticketty_security.platform_provision_tenant(text, text, text, text, text, text, text, text, text, text),
  ticketty_security.platform_list_tenants(text),
  ticketty_security.platform_operator_org(text),
  ticketty_security.platform_suspend_tenant(text, text, text, text),
  ticketty_security.platform_reactivate_tenant(text, text, text),
  ticketty_security.platform_set_subscription(text, text, integer, integer, text, text, text),
  ticketty_security.platform_renew_subscription(text, integer, text, text),
  ticketty_security.platform_expire_subscriptions(),
  ticketty_security.platform_list_tenants_v2(text),
  ticketty_security.platform_tenant_report(text, integer),
  ticketty_security.platform_list_events(text, integer),
  ticketty_security.platform_ack_event(text, text),
  ticketty_security.platform_health()
FROM PUBLIC;

REVOKE ALL ON TABLE "subscriptions", "system_events" FROM PUBLIC;

-- منح تشغيلية: سياسات RLS على organizations تستدعي current_organization_id()
-- عند تقييم التحديثات تحت دور ticketty_platform — والدوال المنصة تحتاج
-- وصولاً مقيداً لهذه الجداول تحديداً (لا شيء آخر).
GRANT EXECUTE ON FUNCTION ticketty_security.current_organization_id() TO ticketty_platform;
GRANT SELECT, UPDATE ON "organizations" TO ticketty_platform;
GRANT SELECT, INSERT, UPDATE ON "subscriptions" TO ticketty_platform;
GRANT SELECT, UPDATE ON "system_events" TO ticketty_platform;
GRANT INSERT ON "system_events" TO ticketty_platform;
GRANT INSERT ON "audit_logs" TO ticketty_platform;

GRANT EXECUTE ON FUNCTION ticketty_security.platform_suspend_tenant(text, text, text, text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_reactivate_tenant(text, text, text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_set_subscription(text, text, integer, integer, text, text, text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_renew_subscription(text, integer, text, text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_expire_subscriptions() TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_list_tenants_v2(text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_tenant_report(text, integer) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_list_events(text, integer) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_ack_event(text, text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_health() TO ticketty_platform;
