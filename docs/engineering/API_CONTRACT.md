# API Contract

## Current conventions

- Backend base prefix: `/api`.
- Web calls backend through same-origin BFF proxy routes.
- DTO validation uses Nest global `ValidationPipe` with whitelist, transform, and rejection of unknown properties.
- Permissions are declared on controllers and enforced globally.

## Required contract rules

- Authenticated organization/branch/ownership scope is never accepted from request input as authority.
- Transaction-sensitive POST commands require validated `Idempotency-Key` and persist the operation result. Booking creation and booking/trip cancellation currently enforce keys; cancellation also verifies request hashes and safe replay.
- Resource lists accept `page` and `limit`, default to 50 rows, cap at 200, preserve the legacy array response shape, and use stable tie-break sorting. This covers operational lists plus routes, drivers, buses, seat templates, branches, roles, and users.
- Errors use a stable `{ statusCode, code, message, requestId }` envelope. Implemented codes include `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `DUPLICATE_OPERATION`, `RATE_LIMITED`, `REQUEST_FAILED`, and `INTERNAL_ERROR`.
- Prisma uniqueness/FK/not-found failures map to sanitized 409/400/404 responses without exposing database details.
- Sensitive projections are permission-aware; passenger PII and financial details are not included by default.
- Accounting APIs expose account setup, journals, fiscal periods, balanced drafts, posting, idempotent reversal, policy configuration, durable event queue visibility/processing, source posting, paginated listing, and guarded period closure under granular permissions.
- API versioning and generated OpenAPI documentation remain missing.

## Pagination compatibility

Pagination currently preserves direct array bodies for existing web clients. Consumers advance with `page=N&limit=M` until a page contains fewer than `limit` records. A future cursor/envelope contract must be versioned rather than silently changing these response bodies.
