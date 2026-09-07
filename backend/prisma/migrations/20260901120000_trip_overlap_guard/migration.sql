-- Bus/Driver scheduling overlap guard (MASTER_PLAN Phase 8).
--
-- A bus (and a driver) cannot be assigned to two active trips whose
-- scheduled intervals overlap. The interval is [departure, arrival):
-- immediate reuse at the exact arrival instant is allowed. Trips without an
-- arrival are treated as instantaneous (empty range never overlaps).
-- Cancelled/completed trips are exempt.
--
-- Requires btree_gist for the equality columns in the exclusion constraint.
-- Columns are timestamp(3) without time zone, so tsrange (immutable) is used.
-- This constraint is intentionally NOT modeled in schema.prisma (Prisma has
-- no EXCLUDE support). Guarded by test/sql/trip-overlap.sql.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "trips"
  ADD CONSTRAINT "trips_bus_schedule_no_overlap_excl"
  EXCLUDE USING gist (
    "organizationId" WITH =,
    "busId" WITH =,
    tsrange("departureAt", "arrivalAt", '[)') WITH &&
  )
  WHERE ("busId" IS NOT NULL AND "status" IN ('SCHEDULED', 'OPEN', 'FULL', 'DEPARTED'));

ALTER TABLE "trips"
  ADD CONSTRAINT "trips_driver_schedule_no_overlap_excl"
  EXCLUDE USING gist (
    "organizationId" WITH =,
    "driverId" WITH =,
    tsrange("departureAt", "arrivalAt", '[)') WITH &&
  )
  WHERE ("driverId" IS NOT NULL AND "status" IN ('SCHEDULED', 'OPEN', 'FULL', 'DEPARTED'));
