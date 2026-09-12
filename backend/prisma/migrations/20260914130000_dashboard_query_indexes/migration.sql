-- Dashboard/report queries filter by organization and creation time for
-- organization-wide users. Branch-only indexes cannot support that access path.
CREATE INDEX "bookings_organizationId_createdAt_idx"
  ON "bookings"("organizationId", "createdAt");
CREATE INDEX "tickets_organizationId_createdAt_idx"
  ON "tickets"("organizationId", "createdAt");
CREATE INDEX "payments_organizationId_createdAt_idx"
  ON "payments"("organizationId", "createdAt");
