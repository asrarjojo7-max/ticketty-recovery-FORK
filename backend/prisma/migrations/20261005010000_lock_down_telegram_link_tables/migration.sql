-- Telegram account-linking tables are accessed only through narrowly scoped
-- SECURITY DEFINER functions added in a later migration. Until those
-- functions exist, deny direct table access to application roles explicitly.
-- The migration owner retains ownership; no runtime role receives table access.

REVOKE ALL PRIVILEGES ON TABLE
  public.telegram_link_challenges,
  public.telegram_account_links
FROM PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE
  public.telegram_link_challenges,
  public.telegram_account_links
FROM ticketty_runtime, ticketty_app, ticketty_auth, ticketty_platform;
