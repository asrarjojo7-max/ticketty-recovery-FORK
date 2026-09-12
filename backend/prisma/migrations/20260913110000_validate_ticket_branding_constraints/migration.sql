-- Validate binary metadata constraints after the table has been introduced.
ALTER TABLE "organization_ticket_branding"
VALIDATE CONSTRAINT "organization_ticket_branding_assets_check";

ALTER TABLE "organization_ticket_branding"
VALIDATE CONSTRAINT "organization_ticket_branding_bus_asset_check";
