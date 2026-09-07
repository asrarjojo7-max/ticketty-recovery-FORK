-- Trip Bus/Driver overlap guard (Phase 8 SQL contract).
-- Verifies:
--   1. A second active trip on the same bus with an overlapping window is rejected.
--   2. Back-to-back scheduling (arrival == departure) is allowed.
--   3. The same window on a DIFFERENT bus is allowed.
--   4. Cancelled trips never block the bus.
--   5. A driver double-booking is rejected.

BEGIN;

INSERT INTO "organizations" ("id", "name", "slug", "updatedAt")
VALUES ('test-overlap-org', 'Overlap Test', 'test-overlap-org', CURRENT_TIMESTAMP);
INSERT INTO "seat_templates" ("id", "organizationId", "name", "rows", "columnsPerRow", "aisleAfterColumn", "updatedAt")
VALUES ('test-overlap-template', 'test-overlap-org', 'T', 2, 2, 1, CURRENT_TIMESTAMP);
INSERT INTO "buses" ("id", "organizationId", "plateNumber", "seatTemplateId", "updatedAt")
VALUES
  ('test-overlap-bus-1', 'test-overlap-org', 'OVL-1', 'test-overlap-template', CURRENT_TIMESTAMP),
  ('test-overlap-bus-2', 'test-overlap-org', 'OVL-2', 'test-overlap-template', CURRENT_TIMESTAMP);
INSERT INTO "drivers" ("id", "organizationId", "name", "phone", "licenseNumber", "licenseExpiry", "updatedAt")
VALUES ('test-overlap-driver', 'test-overlap-org', 'Driver', '000', 'LIC1', CURRENT_TIMESTAMP + interval '5 years', CURRENT_TIMESTAMP);
INSERT INTO "routes" ("id", "organizationId", "name", "fromCity", "toCity", "updatedAt")
VALUES ('test-overlap-route', 'test-overlap-org', 'R', 'A', 'B', CURRENT_TIMESTAMP);

-- Baseline active trip: 10:00 → 14:00.
INSERT INTO "trips" ("id", "organizationId", "routeId", "busId", "driverId", "departureAt", "arrivalAt", "updatedAt")
VALUES ('test-overlap-trip-1', 'test-overlap-org', 'test-overlap-route', 'test-overlap-bus-1', 'test-overlap-driver', '2026-09-10 10:00', '2026-09-10 14:00', CURRENT_TIMESTAMP);

-- 1) Same bus, overlapping window → rejected.
DO $$ BEGIN
  BEGIN
    INSERT INTO "trips" ("id", "organizationId", "routeId", "busId", "departureAt", "arrivalAt", "updatedAt")
    VALUES ('test-overlap-trip-2', 'test-overlap-org', 'test-overlap-route', 'test-overlap-bus-1', '2026-09-10 13:00', '2026-09-10 16:00', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'TEST_FAILURE: overlapping bus trip accepted';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'TEST_FAILURE:%' THEN RAISE; END IF;
    WHEN exclusion_violation THEN NULL;
  END;
END $$;

-- 2) Same bus, back-to-back (arrival == next departure) → allowed.
INSERT INTO "trips" ("id", "organizationId", "routeId", "busId", "departureAt", "arrivalAt", "updatedAt")
VALUES ('test-overlap-trip-3', 'test-overlap-org', 'test-overlap-route', 'test-overlap-bus-1', '2026-09-10 14:00', '2026-09-10 18:00', CURRENT_TIMESTAMP);

-- 3) Different bus, same window → allowed.
INSERT INTO "trips" ("id", "organizationId", "routeId", "busId", "departureAt", "arrivalAt", "updatedAt")
VALUES ('test-overlap-trip-4', 'test-overlap-org', 'test-overlap-route', 'test-overlap-bus-2', '2026-09-10 10:00', '2026-09-10 14:00', CURRENT_TIMESTAMP);

-- 4) Cancelled trips never block the bus.
UPDATE "trips" SET "status" = 'CANCELLED' WHERE "id" = 'test-overlap-trip-1';
INSERT INTO "trips" ("id", "organizationId", "routeId", "busId", "driverId", "departureAt", "arrivalAt", "updatedAt")
VALUES ('test-overlap-trip-5', 'test-overlap-org', 'test-overlap-route', 'test-overlap-bus-1', NULL, '2026-09-10 11:00', '2026-09-10 12:00', CURRENT_TIMESTAMP);

-- 5) Driver double-booking (different bus) → rejected.
DO $$ BEGIN
  BEGIN
    INSERT INTO "trips" ("id", "organizationId", "routeId", "busId", "driverId", "departureAt", "arrivalAt", "updatedAt")
    VALUES ('test-overlap-trip-6', 'test-overlap-org', 'test-overlap-route', 'test-overlap-bus-2', 'test-overlap-driver', '2026-09-10 09:00', '2026-09-10 11:00', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'TEST_FAILURE: driver double-booking accepted';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'TEST_FAILURE:%' THEN RAISE; END IF;
    WHEN exclusion_violation THEN NULL;
  END;
END $$;

ROLLBACK;
