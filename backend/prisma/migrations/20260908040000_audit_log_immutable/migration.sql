-- Harden the audit trail: the application only INSERTs and SELECTs audit
-- records. Granting UPDATE/DELETE to the runtime tenant role made the ledger
-- erasable from inside a tenant (audit finding P1-2). Append-only from now on.

-- Idempotent: safe to re-run.
REVOKE DELETE ON TABLE "audit_logs" FROM "ticketty_app";
REVOKE UPDATE ON TABLE "audit_logs" FROM "ticketty_app";

-- Defense in depth: even the superuser-connected operator flows must not be
-- able to rewrite history silently. A guard trigger rejects UPDATE/DELETE of
-- existing audit rows for every role except a dedicated maintenance role.
CREATE OR REPLACE FUNCTION "enforce_audit_log_immutability"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS "audit_logs_immutable_guard" ON "audit_logs";
CREATE TRIGGER "audit_logs_immutable_guard"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "enforce_audit_log_immutability"();

-- The maintenance path (explicit, auditable, owner-only): disable the guard
-- via ALTER TABLE ... DISABLE TRIGGER requires table ownership anyway, so no
-- additional role needs any grant here.
