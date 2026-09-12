-- Narrow global read boundary for accounting worker observability.
-- The worker role receives no direct table SELECT and can only obtain grouped
-- status counts; no tenant, event, amount, or payload data is exposed.
CREATE OR REPLACE FUNCTION ticketty_security.accounting_queue_depth()
RETURNS TABLE (status text, event_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT e.status::text, count(*)::integer
  FROM public.accounting_events e
  GROUP BY e.status
$$;

REVOKE ALL ON FUNCTION ticketty_security.accounting_queue_depth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ticketty_security.accounting_queue_depth()
  TO ticketty_accounting_worker;
