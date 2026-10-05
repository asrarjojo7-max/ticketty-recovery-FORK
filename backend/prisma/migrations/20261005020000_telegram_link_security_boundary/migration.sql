-- Narrow database boundary for Telegram account linking.
--
-- Application roles never receive direct table access. The authenticated
-- backend uses ticketty_auth, including for bot-authenticated requests after
-- the application has independently verified the bot HMAC/session boundary.
-- All state transitions below are atomic inside PostgreSQL.

CREATE OR REPLACE FUNCTION ticketty_security.telegram_create_link_challenge(
  p_id text,
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
  IF octet_length(p_token_digest) <> 32 THEN
    RAISE EXCEPTION 'Invalid Telegram link token digest';
  END IF;

  IF p_expires_at <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Telegram link challenge must expire in the future';
  END IF;

  IF p_telegram_user_id IS NULL OR btrim(p_telegram_user_id) = ''
     OR p_telegram_chat_id IS NULL OR btrim(p_telegram_chat_id) = '' THEN
    RAISE EXCEPTION 'Telegram identity is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."users" u
    JOIN public."organizations" o ON o."id" = u."organizationId"
    WHERE u."id" = current_setting('app.auth_user_id', true)
      AND u."active" = TRUE
      AND o."active" = TRUE
  ) THEN
    RAISE EXCEPTION 'Authenticated user is not active';
  END IF;

  INSERT INTO public."telegram_link_challenges" (
    "id",
    "token_digest",
    "telegram_user_id",
    "telegram_chat_id",
    "expires_at"
  )
  VALUES (
    p_id,
    p_token_digest,
    p_telegram_user_id,
    p_telegram_chat_id,
    p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION ticketty_security.telegram_confirm_link(
  p_token_digest bytea,
  p_user_id text
)
RETURNS TABLE (
  user_id text,
  telegram_user_id text,
  telegram_chat_id text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_challenge public."telegram_link_challenges"%ROWTYPE;
  v_user public."users"%ROWTYPE;
BEGIN
  IF octet_length(p_token_digest) <> 32 THEN
    RAISE EXCEPTION 'Invalid Telegram link token digest';
  END IF;

  SELECT *
  INTO v_challenge
  FROM public."telegram_link_challenges"
  WHERE "token_digest" = p_token_digest
  FOR UPDATE;

  IF NOT FOUND
     OR v_challenge."consumed_at" IS NOT NULL
     OR v_challenge."expires_at" <= CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Telegram link challenge is invalid or expired';
  END IF;

  SELECT *
  INTO v_user
  FROM public."users"
  WHERE "id" = p_user_id
    AND "active" = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not active';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."organizations" o
    WHERE o."id" = v_user."organizationId"
      AND o."active" = TRUE
  ) THEN
    RAISE EXCEPTION 'Organization is not active';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."telegram_account_links" l
    WHERE l."telegram_user_id" = v_challenge."telegram_user_id"
      AND l."active" = TRUE
      AND l."user_id" <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Telegram account is already linked';
  END IF;

  UPDATE public."telegram_account_links"
  SET
    "telegram_chat_id" = v_challenge."telegram_chat_id",
    "active" = TRUE,
    "linked_at" = CURRENT_TIMESTAMP,
    "revoked_at" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "user_id" = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public."telegram_account_links" (
      "id",
      "user_id",
      "telegram_user_id",
      "telegram_chat_id",
      "active"
    )
    VALUES (
      md5(random()::text || clock_timestamp()::text || p_user_id),
      p_user_id,
      v_challenge."telegram_user_id",
      v_challenge."telegram_chat_id",
      TRUE
    );
  END IF;

  UPDATE public."telegram_link_challenges"
  SET "consumed_at" = CURRENT_TIMESTAMP
  WHERE "id" = v_challenge."id"
    AND "consumed_at" IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Telegram link challenge was already consumed';
  END IF;

  RETURN QUERY
  SELECT p_user_id, v_challenge."telegram_user_id", v_challenge."telegram_chat_id";
END;
$$;

CREATE OR REPLACE FUNCTION ticketty_security.telegram_revoke_link(
  p_user_id text
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public."telegram_account_links"
  SET
    "active" = FALSE,
    "revoked_at" = CURRENT_TIMESTAMP,
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "user_id" = p_user_id
    AND "active" = TRUE
  RETURNING TRUE
$$;

CREATE OR REPLACE FUNCTION ticketty_security.telegram_link_for_user(
  p_user_id text
)
RETURNS TABLE (
  user_id text,
  telegram_user_id text,
  telegram_chat_id text,
  active boolean,
  linked_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    l."user_id",
    l."telegram_user_id",
    l."telegram_chat_id",
    l."active",
    l."linked_at",
    l."revoked_at"
  FROM public."telegram_account_links" l
  WHERE l."user_id" = p_user_id
$$;

REVOKE ALL ON FUNCTION ticketty_security.telegram_create_link_challenge(text, bytea, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION ticketty_security.telegram_confirm_link(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ticketty_security.telegram_revoke_link(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ticketty_security.telegram_link_for_user(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ticketty_security.telegram_create_link_challenge(text, bytea, text, text, timestamptz) TO ticketty_auth;
GRANT EXECUTE ON FUNCTION ticketty_security.telegram_confirm_link(bytea, text) TO ticketty_auth;
GRANT EXECUTE ON FUNCTION ticketty_security.telegram_revoke_link(text) TO ticketty_auth;
GRANT EXECUTE ON FUNCTION ticketty_security.telegram_link_for_user(text) TO ticketty_auth;
