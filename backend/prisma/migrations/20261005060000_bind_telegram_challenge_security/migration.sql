CREATE OR REPLACE FUNCTION ticketty_security.telegram_create_link_challenge(
  p_id text,
  p_user_id text,
  p_token_digest bytea,
  p_telegram_user_id text,
  p_telegram_chat_id text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF octet_length(p_token_digest) <> 32
     OR p_expires_at <= CURRENT_TIMESTAMP
     OR p_telegram_user_id IS NULL
     OR p_telegram_chat_id IS NULL
  THEN
    RAISE EXCEPTION 'Invalid Telegram link challenge';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.organizations o ON o.id = u.organization_id
    WHERE u.id = p_user_id
      AND u.active = TRUE
      AND o.active = TRUE
  ) THEN
    RAISE EXCEPTION 'Authenticated user is not active';
  END IF;

  INSERT INTO public.telegram_link_challenges (
    id, user_id, token_digest, telegram_user_id, telegram_chat_id, expires_at
  )
  VALUES (
    p_id, p_user_id, p_token_digest, p_telegram_user_id, p_telegram_chat_id, p_expires_at
  );
END;
$$;

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
       AND l.user_id <> v_challenge.user_id
  ) THEN
    RAISE EXCEPTION 'Telegram account is already linked';
  END IF;

  UPDATE public.telegram_link_challenges
     SET telegram_user_id = p_telegram_user_id,
         telegram_chat_id = p_telegram_chat_id
   WHERE id = v_challenge.id;

  RETURN QUERY
  SELECT v_challenge.user_id, p_telegram_user_id, p_telegram_chat_id;
END;
$$;

CREATE OR REPLACE FUNCTION ticketty_security.telegram_confirm_link(
  p_token_digest bytea,
  p_user_id text
)
RETURNS TABLE(user_id text, telegram_user_id text, telegram_chat_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_challenge public.telegram_link_challenges%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_link public.telegram_account_links%ROWTYPE;
BEGIN
  IF octet_length(p_token_digest) <> 32 OR p_user_id = '' THEN
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
     OR left(v_challenge.telegram_user_id, 8) = 'pending:'
     OR left(v_challenge.telegram_chat_id, 8) = 'pending:'
     OR v_challenge.user_id <> p_user_id
  THEN
    RAISE EXCEPTION 'Telegram link challenge is invalid';
  END IF;

  SELECT *
    INTO v_user
    FROM public.users
   WHERE id = p_user_id
     AND active = TRUE
   FOR UPDATE;

  IF NOT FOUND OR v_user.organization_id IS NULL THEN
    RAISE EXCEPTION 'Telegram link user is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = v_user.organization_id AND o.active = TRUE
  ) THEN
    RAISE EXCEPTION 'Telegram link organization is inactive';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.telegram_account_links l
     WHERE l.telegram_user_id = v_challenge.telegram_user_id
       AND l.user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Telegram account is already linked';
  END IF;

  SELECT *
    INTO v_link
    FROM public.telegram_account_links
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF FOUND THEN
    IF v_link.telegram_user_id <> v_challenge.telegram_user_id THEN
      RAISE EXCEPTION 'Telegram identity replacement is not allowed';
    END IF;

    UPDATE public.telegram_account_links
       SET telegram_chat_id = v_challenge.telegram_chat_id,
           active = TRUE,
           revoked_at = NULL,
           updated_at = clock_timestamp()
     WHERE id = v_link.id;
  ELSE
    INSERT INTO public.telegram_account_links (
      id, user_id, telegram_user_id, telegram_chat_id, active, linked_at, updated_at
    )
    VALUES (
      v_challenge.id, p_user_id, v_challenge.telegram_user_id,
      v_challenge.telegram_chat_id, TRUE, clock_timestamp(), clock_timestamp()
    );
  END IF;

  UPDATE public.telegram_link_challenges
     SET consumed_at = clock_timestamp()
   WHERE id = v_challenge.id
     AND consumed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Telegram link challenge was already consumed';
  END IF;

  RETURN QUERY
  SELECT p_user_id, v_challenge.telegram_user_id, v_challenge.telegram_chat_id;
END;
$$;

REVOKE ALL ON FUNCTION ticketty_security.telegram_create_link_challenge(text, text, bytea, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION ticketty_security.telegram_attach_link_challenge(bytea, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ticketty_security.telegram_confirm_link(bytea, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ticketty_security.telegram_create_link_challenge(text, text, bytea, text, text, timestamptz) TO ticketty_auth;
GRANT EXECUTE ON FUNCTION ticketty_security.telegram_attach_link_challenge(bytea, text, text) TO ticketty_auth;
GRANT EXECUTE ON FUNCTION ticketty_security.telegram_confirm_link(bytea, text) TO ticketty_auth;
