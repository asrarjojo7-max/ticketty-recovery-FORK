-- Runtime tenant isolation. Application requests SET LOCAL ROLE ticketty_app
-- and a transaction-local app.organization_id before touching tenant data.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ticketty_app') THEN
    CREATE ROLE ticketty_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT ticketty_app TO %I', current_user);
END
$$;

CREATE SCHEMA IF NOT EXISTS ticketty_security;

CREATE OR REPLACE FUNCTION ticketty_security.current_organization_id()
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')
$$;

REVOKE ALL ON FUNCTION ticketty_security.current_organization_id() FROM PUBLIC;
GRANT USAGE ON SCHEMA public, ticketty_security TO ticketty_app;
GRANT EXECUTE ON FUNCTION ticketty_security.current_organization_id() TO ticketty_app;

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_tenant_isolation ON "organizations";
CREATE POLICY organizations_tenant_isolation ON "organizations"
  USING ("id" = ticketty_security.current_organization_id())
  WITH CHECK ("id" = ticketty_security.current_organization_id());

DO $$
DECLARE
  table_name text;
  tenant_tables text[] := ARRAY[
    'branches',
    'customers',
    'routes',
    'buses',
    'drivers',
    'seat_templates',
    'trips',
    'bookings',
    'tickets',
    'payments',
    'refunds',
    'idempotency_records',
    'manifests',
    'agents',
    'commissions',
    'expenses',
    'expense_adjustments',
    'settlements',
    'settlement_lines',
    'audit_logs'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', table_name || '_tenant_isolation', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING ("organizationId" = ticketty_security.current_organization_id()) WITH CHECK ("organizationId" = ticketty_security.current_organization_id())',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END
$$;

ALTER TABLE "route_stops" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS route_stops_tenant_isolation ON "route_stops";
CREATE POLICY route_stops_tenant_isolation ON "route_stops"
  USING (
    EXISTS (
      SELECT 1 FROM "routes"
      WHERE "routes"."id" = "route_stops"."routeId"
        AND "routes"."organizationId" = ticketty_security.current_organization_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "routes"
      WHERE "routes"."id" = "route_stops"."routeId"
        AND "routes"."organizationId" = ticketty_security.current_organization_id()
    )
  );

ALTER TABLE "seats" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seats_tenant_isolation ON "seats";
CREATE POLICY seats_tenant_isolation ON "seats"
  USING (
    EXISTS (
      SELECT 1 FROM "seat_templates"
      WHERE "seat_templates"."id" = "seats"."seatTemplateId"
        AND "seat_templates"."organizationId" = ticketty_security.current_organization_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "seat_templates"
      WHERE "seat_templates"."id" = "seats"."seatTemplateId"
        AND "seat_templates"."organizationId" = ticketty_security.current_organization_id()
    )
  );

ALTER TABLE "trip_seats" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trip_seats_tenant_isolation ON "trip_seats";
CREATE POLICY trip_seats_tenant_isolation ON "trip_seats"
  USING (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = "trip_seats"."tripId"
        AND "trips"."organizationId" = ticketty_security.current_organization_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "trips"
      WHERE "trips"."id" = "trip_seats"."tripId"
        AND "trips"."organizationId" = ticketty_security.current_organization_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "organizations", "branches", "customers", "routes", "route_stops",
  "buses", "drivers", "seat_templates", "seats", "trips", "trip_seats",
  "bookings", "tickets", "payments", "refunds", "idempotency_records",
  "manifests", "agents", "commissions", "expenses", "expense_adjustments",
  "settlements", "settlement_lines", "audit_logs"
TO ticketty_app;

-- Authentication and authorization lookup tables remain outside tenant RLS.
-- Business services still apply explicit organization filters to these tables.
GRANT SELECT, INSERT, UPDATE ON "users", "roles" TO ticketty_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ticketty_app;
