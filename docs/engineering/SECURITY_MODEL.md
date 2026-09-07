# Security Model

## Trust boundaries

Tenant isolation is a security boundary. Effective authorization is:

`authenticated user → active organization membership → branch scope → permission → ownership/resource policy`

Organization and branch IDs from the client are identifiers to validate, never authority.

## Existing controls

- Password hashing with bcrypt.
- Global JWT and permission guards.
- Active user/organization revalidation per protected request.
- Helmet, constrained CORS, input validation, and rate limiting.
- HttpOnly/SameSite web session cookie through a BFF; no sensitive token in Local Storage.
- Environment files ignored by Git; checked-in examples contain placeholders only.
- Fail-fast backend and server-side web configuration validation.
- JWT verification pins HS256, issuer, and audience; BFF cookie lifetime follows token expiry.
- Strict same-origin checks on state-changing BFF requests.
- Sanitized request IDs propagate through the BFF and backend structured completion logs.

## Open high risks

- Tenant/branch consistency is enforced in application code and database constraints/triggers. Runtime requests additionally execute inside a transaction-local organization context under the non-owner `ticketty_app` role; missing context fails closed under RLS.
- Agent own-vs-all is implemented for core resources, but the complete endpoint authorization matrix is not yet proven.
- Core refund/trip-state races have contention tests; broader lifecycle and load proof remains.
- Database-backed account lockout now limits repeated password attempts; JWT key rotation/revocation and centralized secret management remain absent.
- Audit event coverage remains partial; request correlation is now implemented.
- Role creation and assignment now enforce a grant ceiling so delegated administrators cannot grant permissions they do not possess; PII exposure still needs more granular projections/permissions.
- In-memory throttling is not suitable for multiple instances.

## Closed this cycle

Tenant users without an organization are now rejected at login and during JWT request revalidation. Ticket list, ID lookup, and QR lookup additionally fail closed and consistently enforce organization plus optional branch scope. Regression tests cover login and ticket-service boundaries.

## Completion gate

No critical module is complete until authentication, permissions, tenant, branch, ownership, validation, output exposure, CSRF/XSS/SSRF/IDOR, races, replay/idempotency, audit, logging, and abuse controls are reviewed and tested.
