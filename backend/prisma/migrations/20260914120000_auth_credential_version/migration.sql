-- Bind every JWT to the exact password version (millisecond precision).
-- This closes the one-second race inherent in comparing JWT iat seconds with
-- passwordChangedAt and deliberately invalidates tokens issued by older code.
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
  password_changed_at timestamp(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    u."id", u."organizationId", u."branchId", u."name", u."email",
    u."passwordHash", u."active", u."failedLoginAttempts", u."lockedUntil",
    r."key", r."permissions", o."active", u."passwordChangedAt"
  FROM public."users" u
  JOIN public."roles" r ON r."id" = u."roleId"
  JOIN public."organizations" o ON o."id" = u."organizationId"
  WHERE u."email" = p_email
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION ticketty_security.auth_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ticketty_security.auth_user_by_email(text) TO ticketty_auth;
