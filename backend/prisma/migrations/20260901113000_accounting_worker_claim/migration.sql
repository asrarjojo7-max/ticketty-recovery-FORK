DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ticketty_accounting_worker') THEN
    CREATE ROLE ticketty_accounting_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT ticketty_accounting_worker TO %I', current_user);
END $$;

CREATE OR REPLACE FUNCTION ticketty_security.claim_accounting_event(p_worker_id text)
RETURNS TABLE (event_id text, organization_id text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT e."id"
    FROM public."accounting_events" e
    WHERE e."status" IN ('PENDING', 'FAILED')
      AND e."attempts" < 5
      AND e."availableAt" <= CURRENT_TIMESTAMP
      AND (e."lockedAt" IS NULL OR e."lockedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
    ORDER BY e."createdAt"
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public."accounting_events" e
  SET "status" = 'PENDING',
      "attempts" = e."attempts" + 1,
      "lockedAt" = CURRENT_TIMESTAMP,
      "lockedBy" = p_worker_id
  FROM candidate
  WHERE e."id" = candidate."id"
  RETURNING e."id", e."organizationId";
END;
$$;

REVOKE ALL ON FUNCTION ticketty_security.claim_accounting_event(text) FROM PUBLIC;
GRANT USAGE ON SCHEMA ticketty_security TO ticketty_accounting_worker;
GRANT EXECUTE ON FUNCTION ticketty_security.claim_accounting_event(text) TO ticketty_accounting_worker;
