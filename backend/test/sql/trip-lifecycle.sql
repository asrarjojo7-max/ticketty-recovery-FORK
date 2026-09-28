-- Trip lifecycle + open-ended schedule regression contract.
-- Requires migrations through 2026-09-28.

BEGIN;

INSERT INTO "organizations" ("id", "name", "slug", "updatedAt")
VALUES ('test-trip-lifecycle-org', 'Trip Lifecycle Test', 'test-trip-lifecycle-org', CURRENT_TIMESTAMP);

INSERT INTO "seat_templates"
  ("id", "organizationId", "name", "rows", "columnsPerRow", "aisleAfterColumn", "updatedAt")
VALUES
  ('test-trip-lifecycle-template', 'test-trip-lifecycle-org', 'T', 1, 1, 0, CURRENT_TIMESTAMP);

INSERT INTO "buses"
  ("id", "organizationId", "plateNumber", "seatTemplateId", "updatedAt")
VALUES
  ('test-trip-lifecycle-bus', 'test-trip-lifecycle-org', 'LC-1', 'test-trip-lifecycle-template', CURRENT_TIMESTAMP);

INSERT INTO "routes"
  ("id", "organizationId", "name", "fromCity", "toCity", "updatedAt")
VALUES
  ('test-trip-lifecycle-route', 'test-trip-lifecycle-org', 'R', 'A', 'B', CURRENT_TIMESTAMP);

-- The database must reject terminal state insertion.
DO $$
BEGIN
  BEGIN
    INSERT INTO "trips"
      ("id", "organizationId", "routeId", "busId", "departureAt", "arrivalAt", "status", "updatedAt")
    VALUES
      ('test-trip-invalid-insert', 'test-trip-lifecycle-org', 'test-trip-lifecycle-route',
       'test-trip-lifecycle-bus', '2026-09-28 08:00', '2026-09-28 10:00',
       'COMPLETED', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'TEST_FAILURE: terminal trip state accepted on insert';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_FAILURE:%' THEN RAISE; END IF;
      IF SQLERRM <> 'Trips must start in SCHEDULED or OPEN state' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO "trips"
  ("id", "organizationId", "routeId", "busId", "departureAt", "arrivalAt", "status", "updatedAt")
VALUES
  ('test-trip-lifecycle-trip', 'test-trip-lifecycle-org', 'test-trip-lifecycle-route',
   'test-trip-lifecycle-bus', '2026-09-28 08:00', '2026-09-28 10:00',
   'OPEN', CURRENT_TIMESTAMP);

-- An open-ended active trip reserves the bus indefinitely.
DO $$
BEGIN
  BEGIN
    INSERT INTO "trips"
      ("id", "organizationId", "routeId", "busId", "departureAt", "arrivalAt", "status", "updatedAt")
    VALUES
      ('test-trip-open-ended-overlap', 'test-trip-lifecycle-org', 'test-trip-lifecycle-route',
       'test-trip-lifecycle-bus', '2026-09-28 09:00', NULL,
       'SCHEDULED', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'TEST_FAILURE: open-ended bus overlap accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_FAILURE:%' THEN RAISE; END IF;
      IF SQLSTATE <> '23P01' THEN RAISE; END IF;
  END;
END $$;

-- OPEN -> COMPLETED is forbidden.
DO $$
BEGIN
  BEGIN
    UPDATE "trips"
    SET "status" = 'COMPLETED'
    WHERE "id" = 'test-trip-lifecycle-trip';
    RAISE EXCEPTION 'TEST_FAILURE: OPEN -> COMPLETED accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_FAILURE:%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE 'Invalid trip status transition:%' THEN RAISE; END IF;
  END;
END $$;

-- OPEN -> DEPARTED -> COMPLETED is the valid completion route.
UPDATE "trips"
SET "status" = 'DEPARTED'
WHERE "id" = 'test-trip-lifecycle-trip';

UPDATE "trips"
SET "status" = 'COMPLETED'
WHERE "id" = 'test-trip-lifecycle-trip';

-- COMPLETED is terminal.
DO $$
BEGIN
  BEGIN
    UPDATE "trips"
    SET "status" = 'OPEN'
    WHERE "id" = 'test-trip-lifecycle-trip';
    RAISE EXCEPTION 'TEST_FAILURE: COMPLETED -> OPEN accepted';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'TEST_FAILURE:%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE 'Invalid trip status transition:%' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
