CREATE OR REPLACE FUNCTION ticketty_security.telegram_attach_link_challenge(
  p_token_digest bytea,
  p_telegram_user_id text,
  p_telegram_chat_id text
)
RETURNS TABLE(user_id text, telegram_user_id text, telegram_chat_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_challenge public.telegram_link_challenges%ROWTYPE;
BEGIN
  IF octet_length(p_token_digest) <> 32
     OR p_telegram_user_id !~ '^-?[0-9]{1,32}$'
     OR p_telegram_chat_id !~ '^-?[0-9]{1,32}$'
  THEN
    RAISE EXCEPTION 'Telegram link challenge is invalid';
  END IF;

  SELECT *
    INTO v_challenge
    FROM public.telegram_link_challenges
   WHERE token_digest = p_token_digest
   FOR UPDATE;

  IF NOT FOUND
     OR v_challenge.consumed_at IS NOT NULL
     OR v_challenge.expires_at <= clock_timestamp()
     OR left(v_challenge.telegram_user_id, 8) <> 'pending:'
  THEN
    RAISE EXCEPTION 'Telegram link challenge is invalid';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.telegram_account_links l
     WHERE l.telegram_user_id = p_telegram_user_id
  ) THEN
    RAISE EXCEPTION 'Telegram account is already linked';
  END IF;

  UPDATE public.telegram_link_challenges
     SET telegram_user_id = p_telegram_user_id,
         telegram_chat_id = p_telegram_chat_id
   WHERE id = v_challenge.id;

  RETURN QUERY
  SELECT
    v_challenge.id,
    p_telegram_user_id,
    p_telegram_chat_id;
END;
$$;

REVOKE ALL ON FUNCTION ticketty_security.telegram_attach_link_challenge(bytea, text, text) FROM PUBLIC;
DO $telegram_role_guard$
DECLARE
  role_name text;
BEGIN
  FOR role_name IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN (
      'ticketty_runtime',
      'ticketty_app',
      'ticketty_platform'
    )
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION ticketty_security.telegram_attach_link_challenge(bytea, text, text) FROM %I',
      role_name
    );
  END LOOP;
END
$telegram_role_guard$;
GRANT EXECUTE ON FUNCTION ticketty_security.telegram_attach_link_challenge(bytea, text, text) TO ticketty_auth;
