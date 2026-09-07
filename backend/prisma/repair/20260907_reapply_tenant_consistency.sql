-- ══════════════════════════════════════════════════════════════════
-- Idempotent re-application of tenant-consistency DDL
-- Source migrations: 20260826162000 + 20260826170000
-- ══════════════════════════════════════════════════════════════════
-- WHY (2026-09-07): the dev database drifted — every composite tenant
-- index (`<t>_id_organizationId_key`) and composite FK
-- (`<t>_<ref>_organizationId_fkey`) was missing while
-- `_prisma_migrations` still recorded the source migrations as
-- applied, so `prisma migrate status` said "up to date". Caught by
-- `pnpm test:db:tenant-consistency` ("cross-tenant bus template
-- accepted"). Root cause: an earlier `prisma migrate dev` drift run
-- renamed/re-created FKs and silently dropped these hand-written
-- composite constraints (Prisma cannot model them). Safe to run at
-- any time (IF NOT EXISTS / DROP IF EXISTS).
--
-- Run:    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/repair/20260907_reapply_tenant_consistency.sql
-- Verify: pnpm test:db:tenant-consistency

-- ===== 20260826162000 =====
CREATE UNIQUE INDEX IF NOT EXISTS "seat_templates_id_organizationId_key"
ON "seat_templates"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_id_organizationId_key"
ON "users"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "trips_id_organizationId_key"
ON "trips"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "buses_id_organizationId_key"
ON "buses"("id", "organizationId");
ALTER TABLE "buses" DROP CONSTRAINT IF EXISTS "buses_seatTemplateId_organizationId_fkey";
ALTER TABLE "buses"
ADD CONSTRAINT "buses_seatTemplateId_organizationId_fkey"
FOREIGN KEY ("seatTemplateId", "organizationId")
REFERENCES "seat_templates"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_userId_organizationId_fkey";
ALTER TABLE "agents"
ADD CONSTRAINT "agents_userId_organizationId_fkey"
FOREIGN KEY ("userId", "organizationId")
REFERENCES "users"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_tripId_organizationId_fkey";
ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_tripId_organizationId_fkey"
FOREIGN KEY ("tripId", "organizationId")
REFERENCES "trips"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_busId_organizationId_fkey";
ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_busId_organizationId_fkey"
FOREIGN KEY ("busId", "organizationId")
REFERENCES "buses"("id", "organizationId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== 20260826170000 =====
CREATE UNIQUE INDEX IF NOT EXISTS "routes_id_organizationId_key" ON "routes"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "drivers_id_organizationId_key" ON "drivers"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "customers_id_organizationId_key" ON "customers"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "agents_id_organizationId_key" ON "agents"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_id_organizationId_key" ON "bookings"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_id_organizationId_key" ON "payments"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "tickets_id_organizationId_key" ON "tickets"("id", "organizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_id_organizationId_key" ON "expenses"("id", "organizationId");
ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_routeId_organizationId_fkey";
ALTER TABLE "trips" ADD CONSTRAINT "trips_routeId_organizationId_fkey"
FOREIGN KEY ("routeId", "organizationId") REFERENCES "routes"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_busId_organizationId_fkey";
ALTER TABLE "trips" ADD CONSTRAINT "trips_busId_organizationId_fkey"
FOREIGN KEY ("busId", "organizationId") REFERENCES "buses"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trips" DROP CONSTRAINT IF EXISTS "trips_driverId_organizationId_fkey";
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_organizationId_fkey"
FOREIGN KEY ("driverId", "organizationId") REFERENCES "drivers"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_tripId_organizationId_fkey";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tripId_organizationId_fkey"
FOREIGN KEY ("tripId", "organizationId") REFERENCES "trips"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_customerId_organizationId_fkey";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customerId_organizationId_fkey"
FOREIGN KEY ("customerId", "organizationId") REFERENCES "customers"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_agentId_organizationId_fkey";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_agentId_organizationId_fkey"
FOREIGN KEY ("agentId", "organizationId") REFERENCES "agents"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_bookingId_organizationId_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_organizationId_fkey"
FOREIGN KEY ("bookingId", "organizationId") REFERENCES "bookings"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_bookingId_organizationId_fkey";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_bookingId_organizationId_fkey"
FOREIGN KEY ("bookingId", "organizationId") REFERENCES "bookings"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_paymentId_organizationId_fkey";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_organizationId_fkey"
FOREIGN KEY ("paymentId", "organizationId") REFERENCES "payments"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_bookingId_organizationId_fkey";
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_bookingId_organizationId_fkey"
FOREIGN KEY ("bookingId", "organizationId") REFERENCES "bookings"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "tickets_tripId_organizationId_fkey";
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tripId_organizationId_fkey"
FOREIGN KEY ("tripId", "organizationId") REFERENCES "trips"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manifests" DROP CONSTRAINT IF EXISTS "manifests_tripId_organizationId_fkey";
ALTER TABLE "manifests" ADD CONSTRAINT "manifests_tripId_organizationId_fkey"
FOREIGN KEY ("tripId", "organizationId") REFERENCES "trips"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "commissions_agentId_organizationId_fkey";
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_agentId_organizationId_fkey"
FOREIGN KEY ("agentId", "organizationId") REFERENCES "agents"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "commissions_bookingId_organizationId_fkey";
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_bookingId_organizationId_fkey"
FOREIGN KEY ("bookingId", "organizationId") REFERENCES "bookings"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" DROP CONSTRAINT IF EXISTS "commissions_ticketId_organizationId_fkey";
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_ticketId_organizationId_fkey"
FOREIGN KEY ("ticketId", "organizationId") REFERENCES "tickets"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_adjustments" DROP CONSTRAINT IF EXISTS "expense_adjustments_expenseId_organizationId_fkey";
ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_expenseId_organizationId_fkey"
FOREIGN KEY ("expenseId", "organizationId") REFERENCES "expenses"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlements" DROP CONSTRAINT IF EXISTS "settlements_agentId_organizationId_fkey";
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_agentId_organizationId_fkey"
FOREIGN KEY ("agentId", "organizationId") REFERENCES "agents"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- (20260826175000_branch_tenant_consistency needs no re-application:
--  its triggers and branch-consistency validation were intact.)
