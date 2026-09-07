-- Close the authentication bootstrap gap while bringing users and roles under RLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ticketty_auth') THEN
    CREATE ROLE ticketty_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT ticketty_auth TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA ticketty_security TO ticketty_auth;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ticketty_auth;

CREATE OR REPLACE FUNCTION ticketty_security.auth_user_by_email(p_email text)
RETURNS TABLE (
  user_id text,
  organization_id text,
  branch_id text,
  user_name text,
  user_email text,
  password_hash text,
  user_active boolean,
  failed_login_attempts integer,
  locked_until timestamp(3),
  role_key text,
  role_permissions text[],
  organization_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    u."id", u."organizationId", u."branchId", u."name", u."email",
    u."passwordHash", u."active", u."failedLoginAttempts", u."lockedUntil",
    r."key", r."permissions", o."active"
  FROM public."users" u
  JOIN public."roles" r ON r."id" = u."roleId"
  JOIN public."organizations" o ON o."id" = u."organizationId"
  WHERE u."email" = p_email
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION ticketty_security.auth_user_by_id(p_user_id text)
RETURNS TABLE (
  user_id text,
  organization_id text,
  branch_id text,
  user_name text,
  user_email text,
  user_active boolean,
  role_key text,
  role_permissions text[],
  organization_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    u."id", u."organizationId", u."branchId", u."name", u."email",
    u."active", r."key", r."permissions", o."active"
  FROM public."users" u
  JOIN public."roles" r ON r."id" = u."roleId"
  JOIN public."organizations" o ON o."id" = u."organizationId"
  WHERE u."id" = p_user_id
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION ticketty_security.auth_record_failed_login(p_user_id text)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public."users"
  SET
    "failedLoginAttempts" = "failedLoginAttempts" + 1,
    "lockedUntil" = CASE
      WHEN "failedLoginAttempts" + 1 >= 5 THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
      ELSE "lockedUntil"
    END,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_user_id
  RETURNING "failedLoginAttempts"
$$;

CREATE OR REPLACE FUNCTION ticketty_security.auth_record_success(p_user_id text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public."users"
  SET
    "failedLoginAttempts" = 0,
    "lockedUntil" = NULL,
    "lastLoginAt" = CURRENT_TIMESTAMP,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = p_user_id
$$;

REVOKE ALL ON FUNCTION ticketty_security.auth_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ticketty_security.auth_user_by_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ticketty_security.auth_record_failed_login(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ticketty_security.auth_record_success(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ticketty_security.auth_user_by_email(text) TO ticketty_auth;
GRANT EXECUTE ON FUNCTION ticketty_security.auth_user_by_id(text) TO ticketty_auth;
GRANT EXECUTE ON FUNCTION ticketty_security.auth_record_failed_login(text) TO ticketty_auth;
GRANT EXECUTE ON FUNCTION ticketty_security.auth_record_success(text) TO ticketty_auth;

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_tenant_select ON "users";
DROP POLICY IF EXISTS users_tenant_insert ON "users";
DROP POLICY IF EXISTS users_tenant_update ON "users";
DROP POLICY IF EXISTS users_tenant_delete ON "users";
CREATE POLICY users_tenant_select ON "users" FOR SELECT
  USING ("organizationId" = ticketty_security.current_organization_id());
CREATE POLICY users_tenant_insert ON "users" FOR INSERT
  WITH CHECK ("organizationId" = ticketty_security.current_organization_id());
CREATE POLICY users_tenant_update ON "users" FOR UPDATE
  USING ("organizationId" = ticketty_security.current_organization_id())
  WITH CHECK ("organizationId" = ticketty_security.current_organization_id());
CREATE POLICY users_tenant_delete ON "users" FOR DELETE
  USING ("organizationId" = ticketty_security.current_organization_id());

ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_tenant_select ON "roles";
DROP POLICY IF EXISTS roles_tenant_insert ON "roles";
DROP POLICY IF EXISTS roles_tenant_update ON "roles";
DROP POLICY IF EXISTS roles_tenant_delete ON "roles";
CREATE POLICY roles_tenant_select ON "roles" FOR SELECT
  USING (
    "organizationId" = ticketty_security.current_organization_id()
    OR "organizationId" IS NULL
  );
CREATE POLICY roles_tenant_insert ON "roles" FOR INSERT
  WITH CHECK ("organizationId" = ticketty_security.current_organization_id());
CREATE POLICY roles_tenant_update ON "roles" FOR UPDATE
  USING ("organizationId" = ticketty_security.current_organization_id())
  WITH CHECK ("organizationId" = ticketty_security.current_organization_id());
CREATE POLICY roles_tenant_delete ON "roles" FOR DELETE
  USING ("organizationId" = ticketty_security.current_organization_id());

-- Future tables receive no runtime grants until an explicit RLS policy is reviewed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ticketty_app;
