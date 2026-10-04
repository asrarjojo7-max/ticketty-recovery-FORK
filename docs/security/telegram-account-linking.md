# Telegram account linking security design

Status: design only; not implemented or enabled.

## Security boundary

Telegram pairing is not proof of a Ticketty identity and MUST NOT grant `platform.admin`, tenant access, or deployment authority. Existing JWT, permissions, platform-operator organization check, tenant RLS, and audited database functions remain authoritative.

## Intended flow

1. A private-chat bot command requests a link challenge from a dedicated backend integration endpoint. The request is authenticated with a separate server-to-server credential, timestamp, nonce/replay protection, strict body limits, and route-specific authorization. It is not a public unauthenticated endpoint and must not reuse a user's JWT.
2. Backend generates a cryptographically random opaque token, stores only its digest, binds it to the exact Telegram user/chat IDs, and expires it after at most 10 minutes. Enforce issuance throttling and one outstanding challenge per Telegram identity.
3. Bot sends a same-origin HTTPS link containing only the opaque challenge. Never put credentials, user IDs, permissions, or PII in the URL. Apply no-referrer and no-store headers; redact challenge paths/query values from logs and analytics.
4. User signs in through the existing web session flow. A dedicated authenticated page displays the Telegram identity and asks for explicit confirmation. Opening the link or merely signing in does not bind.
5. Backend confirmation rechecks active user, `platform.admin`, and the existing platform-operator organization check. Consume the challenge and create the binding atomically; reject expired, replayed, revoked, mismatched, or already-bound identities. Never trust permissions supplied by the browser or bot.
6. Persist a minimal binding (Telegram user/chat IDs, Ticketty user ID, created/revoked timestamps, status). Enforce uniqueness for active Telegram identity and active user binding in the database. Store no bot token or challenge plaintext.
7. Every platform read initiated by Telegram resolves the binding server-side and rechecks current user status, current permissions, and platform-operator scope. Start with an explicit read-only allowlist. Return bounded, redacted summaries only.
8. Revocation is authenticated in the web app, audited, and immediately effective. Re-link requires a fresh challenge and confirmation.

## Deployment separation

The existing Unix-socket HMAC Remote Ops protocol remains a separate deployment capability. Account linking MUST NOT authorize `PLAN_UPDATE`, `EXECUTE_UPDATE`, `CANCEL_PLAN`, or any deployment operation. Do not widen its allowlist as part of account linking. Any future deployment approval requires its own operation-bound, expiring approval and independent authorization design.

## AI boundary

AI classification remains advisory and finite-intent only. It must not produce tool arguments, SQL, URLs, or permission decisions. Deterministic handlers validate every request; unknown or malformed intent fails closed. AI receives no credentials, challenge tokens, raw audit records, or unrestricted tenant data.

## Required implementation and verification

- Add Prisma models and a forward-only migration; review RLS, grants, role ownership, and tenant/platform scoping before enabling writes.
- Add authenticated user endpoints for challenge confirmation, listing, and revocation, plus a narrowly scoped bot integration protocol.
- Reuse the existing platform-operator guard and audit conventions; do not add a bypass role or direct privileged database connection.
- Add tests for unauthorized users, non-platform orgs, inactive users, expired/replayed/mismatched challenges, concurrent confirmation, duplicate bindings, revoked bindings, permission removal after linking, replayed server-to-server requests, rate limits, and redaction.
- Add end-to-end tests through the existing web session proxy and backend guards.
- Keep the feature disabled until migration, tests, CI, deployment configuration, and security review all pass.

## Non-goals for the first release

No financial writes, tenant mutations, user management, subscription changes, deployment actions, or arbitrary AI tool calling from Telegram.
