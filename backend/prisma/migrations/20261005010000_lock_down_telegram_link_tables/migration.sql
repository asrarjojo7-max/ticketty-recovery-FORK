-- Telegram account-linking tables are accessed only through narrowly scoped
-- SECURITY DEFINER functions added in a later migration. Until those
-- functions exist, deny direct table access to application roles explicitly.
-- The migration owner retains ownership; no runtime role receives table access.

REVOKE ALL PRIVILEGES ON TABLE
  public.telegram_link_challenges,
  public.telegram_account_links
FROM PUBLIC;

DO $
DECLARE
  role_name text;
BEGIN
  FOR role_name IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN (
      'ticketty_runtime',
      'ticketty_app',
      'ticketty_auth',
      'ticketty_platform'
    )
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.telegram_link_challenges, public.telegram_account_links FROM %I',
      role_name
    );
  END LOOP;
END
$;
