#!/usr/bin/env node
/**
 * Provision Playwright E2E fixtures directly against the backend DB + API.
 * Creates two dedicated users (OWNER + AGENT) with a known password.
 * Never run against production — it only inserts test accounts.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function envFrom(path) {
  try {
    const raw = readFileSync(path, "utf8");
    const out = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...envFrom("../backend/.env"), ...envFrom(".env.local"), ...process.env };
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL not found (checked backend/.env, .env.local)");
  process.exit(1);
}
const dbUrl = env.DATABASE_URL.replace(/\?schema=.*$/, "");
const email = "e2e-owner@ticketty.local";
const agentEmail = "e2e-agent@ticketty.local";
const password = "E2eTest-Passw0rd-2026";

// bcrypt hash via the backend's own dependency to avoid adding one here.
const hash = execSync(
  `node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 10))" "${password}"`,
  { cwd: "../backend", encoding: "utf8" },
).trim();

const sql = `
DO $$
DECLARE
  org record;
  owner_role text;
  agent_role text;
BEGIN
  SELECT id INTO org FROM organizations LIMIT 1;
  IF org IS NULL THEN
    RAISE EXCEPTION 'No organization found — run backend pnpm db:seed first';
  END IF;
  SELECT id INTO owner_role FROM roles WHERE key='OWNER' AND "organizationId"=org.id LIMIT 1;
  SELECT id INTO agent_role FROM roles WHERE key='AGENT' AND "organizationId"=org.id LIMIT 1;
  IF owner_role IS NULL OR agent_role IS NULL THEN
    RAISE EXCEPTION 'OWNER/AGENT roles missing — seed the database first';
  END IF;

  INSERT INTO users (id, "organizationId", "roleId", name, email, "passwordHash", "updatedAt")
  VALUES ('e2e-owner-user', org.id, owner_role, 'E2E Owner', '${email}', '${hash}', now())
  ON CONFLICT (email) DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash", "roleId"=owner_role;

  INSERT INTO users (id, "organizationId", "roleId", name, email, "passwordHash", "updatedAt")
  VALUES ('e2e-agent-user', org.id, agent_role, 'E2E Agent', '${agentEmail}', '${hash}', now())
  ON CONFLICT (email) DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash", "roleId"=agent_role;
END $$;

-- Guarantee a sellable trip tomorrow (POS golden path needs at least one
-- SCHEDULED/OPEN trip departing in the future on a READY bus).
DO $$
DECLARE
  org record;
  bus_ready record;
  route record;
  template record;
  tomorrow timestamptz := now() + interval '1 day';
  v_trip_id text;
BEGIN
  SELECT id INTO org FROM organizations LIMIT 1;
  SELECT id INTO route FROM routes WHERE "organizationId"=org.id LIMIT 1;
  -- Dedicated fixture bus: old fixture trips carry REAL bookings and
  -- their open-ended schedule ranges block ANY new trip on the same
  -- bus (exclusion constraint). A fresh bus per need keeps the POS
  -- golden path alive without touching historical data.
  SELECT id INTO template FROM seat_templates WHERE "organizationId"=org.id LIMIT 1;
  IF route IS NULL OR template IS NULL THEN
    RAISE NOTICE 'e2e-setup: missing route/template fixture (skipped)';
    RETURN;
  END IF;
  INSERT INTO buses (id, "organizationId", "seatTemplateId", "plateNumber", status, "createdAt", "updatedAt")
  VALUES ('e2e-bus-' || extract(epoch from now())::bigint::text, org.id, template.id,
          'E2E-' || extract(epoch from now())::bigint::text, 'READY', now(), now())
  RETURNING id INTO bus_ready;
  -- Freshness WITHOUT touching real data: the POS golden path needs a
  -- sellable future trip. Old fixture trips accumulate REAL bookings
  -- (FK-protected — deleting them is impossible and wrong anyway), so
  -- we never delete; we look for any still-sellable trip first, and
  -- only provision a NEW uniquely-identified one when none exists.
  IF EXISTS (
    SELECT 1 FROM trips t
    WHERE t."organizationId"=org.id
      AND t.status IN ('OPEN','SCHEDULED')
      AND t."departureAt" > now() + interval '2 hours'
  ) THEN
    RAISE NOTICE 'e2e-setup: a sellable future trip already exists — no new fixture needed';
    RETURN;
  ELSE
    RAISE NOTICE 'e2e-setup: no sellable trip — provisioning one on a fresh fixture bus';
  END IF;
  v_trip_id := 'e2e-trip-' || extract(epoch from now())::bigint::text;
  INSERT INTO trips (id, "organizationId", "routeId", "busId", "departureAt", "status", "updatedAt")
  VALUES (v_trip_id, org.id, route.id, bus_ready.id, tomorrow, 'OPEN', now());
  -- materialize seats from the bus template so the POS can sell
  INSERT INTO trip_seats (id, "tripId", "row", "column", label, "seatType", status, price, "createdAt", "updatedAt")
  SELECT 'e2e-seat-' || extract(epoch from now())::bigint::text || '-' || s.id,
         v_trip_id, s.row, s.column, s.label, s."seatType",
    CASE WHEN s."seatType" IN ('DRIVER','BLOCKED','DISABLED') THEN 'BLOCKED'::\"SeatStatus\" ELSE 'AVAILABLE'::\"SeatStatus\" END,
    2500, now(), now()
  FROM seats s WHERE s."seatTemplateId" = (SELECT "seatTemplateId" FROM buses WHERE id=bus_ready.id);
  RAISE NOTICE 'e2e-setup: fixture trip % provisioned', v_trip_id;
END $$;
`;

execSync(`psql "${dbUrl}"`, { input: sql, stdio: ["pipe", "inherit", "inherit"] });
console.log("E2E fixtures ready:", email, "|", agentEmail);
