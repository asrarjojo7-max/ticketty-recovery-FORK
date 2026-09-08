-- Session invalidation on password change (audit finding P1-3).
--
-- users.passwordChangedAt: stamp set whenever the password hash changes.
-- The JWT guard compares token iat < passwordChangedAt and rejects stale
-- tokens, so a password rotation kills every outstanding session.
-- The change itself runs in tenant context (the acting user's own row),
-- identical to every other user mutation in the system.

-- Idempotent DDL.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00.000';

-- Extend the auth lookup to surface the stamp (JWT guard compares iat).
-- Changing OUT parameters requires DROP + CREATE (cannot REPLACE).
DROP FUNCTION IF EXISTS ticketty_security.auth_user_by_id(text);
CREATE FUNCTION ticketty_security.auth_user_by_id(p_user_id text)
RETURNS TABLE(
  user_id text,
  organization_id text,
  branch_id text,
  user_name text,
  user_email text,
  user_active boolean,
  role_key text,
  role_permissions text[],
  organization_active boolean,
  password_changed_at timestamp(3)
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'pg_catalog', 'public'
AS $function$
  SELECT
    u."id", u."organizationId", u."branchId", u."name", u."email",
    u."active", r."key", r."permissions", o."active", u."passwordChangedAt"
  FROM public."users" u
  JOIN public."roles" r ON r."id" = u."roleId"
  JOIN public."organizations" o ON o."id" = u."organizationId"
  WHERE u."id" = p_user_id
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION ticketty_security.auth_user_by_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ticketty_security.auth_user_by_id(text) TO ticketty_auth;

-- Converge: revoke scratch grants added while prototyping the definer-function
-- approach (minimum-privilege, per finding P1-2's principle).
REVOKE EXECUTE ON FUNCTION ticketty_security.platform_cuid() FROM ticketty_auth;
REVOKE EXECUTE ON FUNCTION ticketty_security.current_organization_id() FROM ticketty_auth;
REVOKE SELECT, UPDATE ON TABLE "users" FROM ticketty_auth;
REVOKE INSERT, SELECT ON TABLE "audit_logs" FROM ticketty_auth;
