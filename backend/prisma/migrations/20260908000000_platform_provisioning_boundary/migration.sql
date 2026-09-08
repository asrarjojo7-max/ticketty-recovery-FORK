-- ─────────────────────────────────────────────────────────────
-- Platform Provisioning Boundary (2026-09-08)
--
-- بوابة إدارة المنصة (Suda-Technologies) تحتاج إنشاء منظمات
-- (Tenants) جديدة خارج أي سياق tenant قائم — وRLS على
-- "organizations" يمنع ذلك عمداً داخل سياق runtime.
--
-- الحل بحدود الثقة نفسها المعتمدة في auth boundary:
-- 1) دور NOLOGIN مخصص: ticketty_platform
-- 2) وظائف SECURITY DEFINER محددة النطاق تماماً:
--    - platform_provision_tenant: إنشاء (منظمة+فرع+دور OWNER+مالك)
--      في معاملة واحدة، مع سجل تدقيق منصة.
--    - platform_lookup_*: قراءات محددة لفحص التصادمات وقائمة
--      الـ Tenants (المعروضات فقط — لا هَش ولا بيانات سرية).
-- 3) لا يُمنح الدور إلا للـ roles التشغيلية عبر GRANT membership
--    وقت التشغيل (SET LOCAL ROLE) — تماماً كـ ticketty_auth.
-- 4) كل الوظائف SEARCH_PATH مقفلة (pg_catalog, public) لمنع
--    hijack الـ search_path.
--
-- صلاحيات الوصول للوظائف تُمنح لـ ticketty_platform فقط —
-- ticketty_app/ticketty_auth لا يريانها.
-- ─────────────────────────────────────────────────────────────

-- 1) الدور المخصص ------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ticketty_platform') THEN
    CREATE ROLE ticketty_platform NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA ticketty_security TO ticketty_platform;

-- 1.5) مولّد معرفات متوافق مع صيغة cuid() في Prisma ----------------
-- INSERT المباشر داخل دوال SQL لا يستطيع استخدام default الخاص بـ
-- Prisma (يُولَّد في طبقة التطبيق)، فنولّد معرفاً بنفس الصيغة هنا.
CREATE OR REPLACE FUNCTION ticketty_security.platform_cuid()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ms bigint;
  v_base text := '';
  v_d int;
  v_rand text;
BEGIN
  -- طابع زمني أساس base36 (نفس فكرة cuid: الزمن أولاً للفرز)
  v_ms := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE v_ms > 0 LOOP
    v_d := (v_ms % 36)::int;
    IF v_d < 10 THEN
      v_base := chr(48 + v_d) || v_base;
    ELSE
      v_base := chr(87 + v_d) || v_base;
    END IF;
    v_ms := v_ms / 36;
  END LOOP;
  -- 16 محرفاً عشوائياً للتفرد داخل نفس المللي ثانية
  SELECT string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', (random() * 35)::int + 1, 1), '')
    INTO v_rand FROM generate_series(1, 16);
  RETURN 'c' || lpad(v_base, 8, '0') || v_rand;
END
$$;

GRANT EXECUTE ON FUNCTION ticketty_security.platform_cuid() TO ticketty_platform;

-- 2) فحص تصادم الـ slug/البريد (قراءات محددة) --------------------
CREATE OR REPLACE FUNCTION ticketty_security.platform_slug_taken(p_slug text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public."organizations" o WHERE o."slug" = p_slug)
$$;

CREATE OR REPLACE FUNCTION ticketty_security.platform_email_taken(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public."users" u WHERE u."email" = p_email)
$$;

-- 3) التزويد الذرّي ----------------------------------------------
-- يُنشئ منظمة + فرعاً رئيسياً + دور OWNER + مالك + سجل تدقيق
-- في معاملة واحدة. يعيد صفّ النتيجة بلا أي بيانات سرية.
-- caller يمرر: p_actor_id/p_actor_org_id للتدقيق.
CREATE OR REPLACE FUNCTION ticketty_security.platform_provision_tenant(
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
  audit_id text
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

  INSERT INTO public."users" ("id", "organizationId", "branchId", "roleId", "name", "email", "passwordHash", "createdAt", "updatedAt")
  VALUES (ticketty_security.platform_cuid(), v_org.id, v_branch.id, v_role.id, p_owner_name, p_owner_email, p_owner_password_hash, clock_timestamp(), clock_timestamp())
  RETURNING "id", "name", "email" INTO v_owner;

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
      'ownerUserId', v_owner.id
    )
  )
  RETURNING "id" INTO v_audit;

  RETURN QUERY
    SELECT
      v_org.id, v_org.slug, v_org.name,
      v_branch.id, v_branch.name, v_branch.city,
      v_role.id, v_role.key,
      v_owner.id, v_owner.name, v_owner.email,
      v_audit.id;
END
$$;

-- 4) قائمة الـ Tenants (قراءة منصة محددة الحقول) -------------------
CREATE OR REPLACE FUNCTION ticketty_security.platform_list_tenants(
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
  trips_count bigint
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
    (SELECT count(*) FROM public."trips" t WHERE t."organizationId" = o."id")
  FROM public."organizations" o
  WHERE p_search IS NULL
     OR o."name" ILIKE '%' || p_search || '%'
     OR o."slug" ILIKE '%' || p_search || '%'
  ORDER BY o."createdAt" DESC
$$;

-- 5) التحقق من منظمة المشغّل (لسماح الدخول لبوابة المنصة) ------------
CREATE OR REPLACE FUNCTION ticketty_security.platform_operator_org(
  p_slug text
)
RETURNS TABLE (org_id text, org_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT o."id", o."active"
  FROM public."organizations" o
  WHERE o."slug" = p_slug
$$;

-- 6) المنح — دور المنصة فقط -------------------------------------
-- نفس نمط auth: منح membership لمن ينفذ المايغريشن حتى يستطيع
-- الـ service التشغيلي SET LOCAL ROLE لاحقاً.
DO $$
BEGIN
  EXECUTE format('GRANT ticketty_platform TO %I', current_user);
END
$$;

GRANT EXECUTE ON FUNCTION ticketty_security.platform_slug_taken(text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_email_taken(text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_provision_tenant(text, text, text, text, text, text, text, text, text, text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_list_tenants(text) TO ticketty_platform;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_operator_org(text) TO ticketty_platform;
