-- Fiscal periods are calendar/date partitions used by both manual posting and
-- automatic accounting-event processing. Overlapping periods make an event date
-- ambiguous: processEvent() would choose one matching OPEN period by startsAt.
--
-- Guard the invariant in PostgreSQL so concurrent writers cannot create overlap
-- even if they bypass the application.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "fiscal_periods" a
    JOIN "fiscal_periods" b
      ON a."organizationId" = b."organizationId"
     AND a."id" < b."id"
     AND daterange(a."startsAt", a."endsAt", '[]')
         && daterange(b."startsAt", b."endsAt", '[]')
  ) THEN
    RAISE EXCEPTION
      'fiscal_periods contain overlapping date ranges; reconcile before applying fiscal-period overlap guard';
  END IF;
END $$;

ALTER TABLE "fiscal_periods"
  ADD CONSTRAINT "fiscal_periods_no_overlap_excl"
  EXCLUDE USING gist (
    "organizationId" WITH =,
    daterange("startsAt", "endsAt", '[]') WITH &&
  );
