-- Trip lifecycle and open-ended schedule integrity.
--
-- Domain transitions are enforced in PostgreSQL as defense in depth:
-- SCHEDULED -> OPEN | DEPARTED | CANCELLED
-- OPEN      -> FULL | DEPARTED | CANCELLED
-- FULL      -> OPEN | DEPARTED | CANCELLED
-- DEPARTED  -> COMPLETED
-- COMPLETED/CANCELLED are terminal.
--
-- Open-ended trips (arrivalAt IS NULL) occupy the schedule through
-- timestamp 'infinity', so they cannot overlap another active trip.

CREATE OR REPLACE FUNCTION enforce_trip_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" NOT IN ('SCHEDULED', 'OPEN') THEN
      RAISE EXCEPTION 'Trips must start in SCHEDULED or OPEN state';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = NEW."status" THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'SCHEDULED'
     AND NEW."status" IN ('OPEN', 'DEPARTED', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'OPEN'
     AND NEW."status" IN ('FULL', 'DEPARTED', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'FULL'
     AND NEW."status" IN ('OPEN', 'DEPARTED', 'CANCELLED') THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'DEPARTED'
     AND NEW."status" = 'COMPLETED' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid trip status transition: % -> %',
    OLD."status", NEW."status";
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trips_status_transition_guard" ON "trips";
CREATE TRIGGER "trips_status_transition_guard"
BEFORE INSERT OR UPDATE OF "status" ON "trips"
FOR EACH ROW
EXECUTE FUNCTION enforce_trip_status_transition();

ALTER TABLE "trips"
  DROP CONSTRAINT IF EXISTS "trips_bus_schedule_no_overlap_excl",
  DROP CONSTRAINT IF EXISTS "trips_driver_schedule_no_overlap_excl";

ALTER TABLE "trips"
  ADD CONSTRAINT "trips_bus_schedule_no_overlap_excl"
  EXCLUDE USING gist (
    "organizationId" WITH =,
    "busId" WITH =,
    tsrange(
      "departureAt",
      COALESCE("arrivalAt", 'infinity'::timestamp),
      '[)'
    ) WITH &&
  )
  WHERE (
    "busId" IS NOT NULL
    AND "status" IN ('SCHEDULED', 'OPEN', 'FULL', 'DEPARTED')
  );

ALTER TABLE "trips"
  ADD CONSTRAINT "trips_driver_schedule_no_overlap_excl"
  EXCLUDE USING gist (
    "organizationId" WITH =,
    "driverId" WITH =,
    tsrange(
      "departureAt",
      COALESCE("arrivalAt", 'infinity'::timestamp),
      '[)'
    ) WITH &&
  )
  WHERE (
    "driverId" IS NOT NULL
    AND "status" IN ('SCHEDULED', 'OPEN', 'FULL', 'DEPARTED')
  );
