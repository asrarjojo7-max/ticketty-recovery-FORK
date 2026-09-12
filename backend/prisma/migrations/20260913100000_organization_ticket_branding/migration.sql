-- Tenant-specific ticket identity and assets. Binary artwork is kept in PostgreSQL
-- so branding survives stateless application deployments and remains tenant scoped.
CREATE TABLE "organization_ticket_branding" (
    "organizationId" TEXT NOT NULL,
    "tagline" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#07558C',
    "secondaryColor" TEXT NOT NULL DEFAULT '#F7941D',
    "checkInMinutes" INTEGER NOT NULL DEFAULT 30,
    "baggagePieces" INTEGER NOT NULL DEFAULT 1,
    "logo" BYTEA,
    "logoMime" TEXT,
    "logoBytes" INTEGER,
    "logoSha256" TEXT,
    "busImage" BYTEA,
    "busImageMime" TEXT,
    "busImageBytes" INTEGER,
    "busImageSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_ticket_branding_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "organization_ticket_branding"
ADD CONSTRAINT "organization_ticket_branding_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_ticket_branding"
ADD CONSTRAINT "organization_ticket_branding_checkInMinutes_check"
CHECK ("checkInMinutes" BETWEEN 0 AND 180);

ALTER TABLE "organization_ticket_branding"
ADD CONSTRAINT "organization_ticket_branding_baggagePieces_check"
CHECK ("baggagePieces" BETWEEN 0 AND 10);

ALTER TABLE "organization_ticket_branding"
ADD CONSTRAINT "organization_ticket_branding_colors_check"
CHECK (
  "primaryColor" ~ '^#[0-9A-Fa-f]{6}$'
  AND "secondaryColor" ~ '^#[0-9A-Fa-f]{6}$'
);

ALTER TABLE "organization_ticket_branding"
ADD CONSTRAINT "organization_ticket_branding_assets_check"
CHECK (
  ("logo" IS NULL AND "logoMime" IS NULL AND "logoBytes" IS NULL AND "logoSha256" IS NULL)
  OR ("logo" IS NOT NULL AND "logoMime" IN ('image/png', 'image/webp', 'image/jpeg') AND "logoBytes" > 0 AND "logoSha256" ~ '^[0-9a-f]{64}$')
) NOT VALID;

ALTER TABLE "organization_ticket_branding"
ADD CONSTRAINT "organization_ticket_branding_bus_asset_check"
CHECK (
  ("busImage" IS NULL AND "busImageMime" IS NULL AND "busImageBytes" IS NULL AND "busImageSha256" IS NULL)
  OR ("busImage" IS NOT NULL AND "busImageMime" IN ('image/png', 'image/webp', 'image/jpeg') AND "busImageBytes" > 0 AND "busImageSha256" ~ '^[0-9a-f]{64}$')
) NOT VALID;

ALTER TABLE "organization_ticket_branding" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organization_ticket_branding_tenant_isolation"
ON "organization_ticket_branding"
USING ("organizationId" = ticketty_security.current_organization_id())
WITH CHECK ("organizationId" = ticketty_security.current_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "organization_ticket_branding" TO ticketty_app;
