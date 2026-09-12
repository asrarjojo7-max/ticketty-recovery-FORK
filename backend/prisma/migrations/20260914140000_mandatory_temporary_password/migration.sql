-- Persist and enforce the initial-password lifecycle without changing existing users.
ALTER TABLE public."users"
  ADD COLUMN "mustChangePassword" boolean NOT NULL DEFAULT false;

-- Authentication lookups expose the database-backed requirement. These
-- functions remain the only cross-tenant credential read boundary.
DROP FUNCTION IF EXISTS ticketty_security.auth_user_by_email(text);

CREATE FUNCTION ticketty_security.auth_user_by_email(p_email text)
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
  organization_active boolean,
  password_changed_at timestamp(3),
  must_change_password boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    u."id", u."organizationId", u."branchId", u."name", u."email",
    u."passwordHash", u."active", u."failedLoginAttempts", u."lockedUntil",
    r."key", r."permissions", o."active", u."passwordChangedAt",
    u."mustChangePassword"
  FROM public."users" u
  JOIN public."roles" r ON r."id" = u."roleId"
  JOIN public."organizations" o ON o."id" = u."organizationId"
  WHERE u."email" = p_email
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION ticketty_security.auth_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ticketty_security.auth_user_by_email(text) TO ticketty_auth;

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
  must_change_password boolean,
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
    u."mustChangePassword", sub.status, sub."currentPeriodEnd"
  FROM public."users" u
  JOIN public."roles" r ON r."id" = u."roleId"
  JOIN public."organizations" o ON o."id" = u."organizationId"
  LEFT JOIN LATERAL (
    SELECT s."status", s."currentPeriodEnd"
    FROM public."subscriptions" s
    WHERE s."organizationId" = u."organizationId"
    ORDER BY s."startedAt" DESC
    LIMIT 1
  ) sub ON true
  WHERE u."id" = p_user_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION ticketty_security.auth_user_by_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ticketty_security.auth_user_by_id(text) TO ticketty_auth;

-- Platform provisioning remains atomic: PlatformService calls this narrow
-- SECURITY DEFINER function in the same withPlatformRole transaction as
-- platform_provision_tenant. It can only tighten an account's state.
CREATE OR REPLACE FUNCTION ticketty_security.platform_mark_temporary_password(
  p_user_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public."users"
  SET "mustChangePassword" = true,
      "updatedAt" = clock_timestamp()
  WHERE "id" = p_user_id
$$;

REVOKE ALL ON FUNCTION ticketty_security.platform_mark_temporary_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ticketty_security.platform_mark_temporary_password(text) TO ticketty_platform;
