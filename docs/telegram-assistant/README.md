# Telegram Assistant — Product & Security Decisions

> **Status:** Decision record / implementation contract. This document records the agreed direction; it does not claim that every item is implemented or deployed.
>
> **Scope:** The Telegram Assistant is a private platform-operations interface for the Ticketty platform administrator. It is not a tenant-facing bot and not a replacement for the Ticketty web application, backend authorization, audit system, or deployment tooling.

## 1. Product purpose and audience

- The bot is an additional interface for managing the Ticketty platform, especially platform-level operations that currently require the website administration area.
- The bot is for the platform administrator only. It is **not** intended for every Ticketty tenant, company, employee, or customer.
- It must use the same platform roles, permissions, scope boundaries, and business rules as the existing backend. Telegram must not become a parallel authorization system.
- The bot must not introduce an operation merely because it is convenient in chat. Before exposing any action, inspect the existing backend policy and the relevant permission checks.
- The bot must not bypass customer-data protection rules, including for a Super Admin. Platform administration does not imply unrestricted access to tenant customer identities or personal data.

## 2. Interaction and language

- Natural-language input is the primary interaction model. Menus, buttons, and command templates are secondary conveniences, not the only way to use the assistant.
- Support Arabic, including Sudanese Arabic, and respond in clear, practical language.
- Menus and available actions must be generated from the operator's actual permissions and current capabilities.
- A menu item or prior approval is never authorization by itself. Permissions and resource scope must be checked again when the operation executes.
- Present concise, human-readable results and errors. Do not expose stack traces, secrets, internal tokens, or unnecessary implementation details.

## 3. AI provider and model policy

- AI is accessed through a configurable endpoint and API key. Credentials remain server-side and must never be committed to GitHub, sent to Telegram, or exposed to the model unnecessarily.
- Prefer an OpenAI-compatible API so providers can be changed without redesigning the assistant.
- Support multiple providers/models and allow the platform administrator to switch the configured provider/model through the bot.
- A **free model is mandatory**, or a model that has a genuinely available free trial/offer at the time it is selected. Do not assume an offer remains free; make the configured provider/model and any applicable usage limits clear.
- AI-provider outage or quota exhaustion must not disable core Ticketty functions or non-AI operational paths. The assistant should fail safely and explain that AI is unavailable.
- Send the minimum data needed for a task. Use short, isolated context; do not pass entire tenant datasets or unrelated conversation history to the model.
- The model proposes intent and arguments; it does not grant permissions and must not directly execute unrestricted SQL, shell commands, or arbitrary code.

## 4. Tools and operation boundaries

- Use narrowly defined, purpose-specific tools backed by existing application services and policy checks.
- Do not provide unrestricted database access, arbitrary SQL, shell execution, or a generic “run command” tool to the model.
- Keep the existing Remote Ops interface limited to its deployment/operations purpose. Do not turn its allowlist or HMAC channel into a generic platform-admin API.
- Prefer read/query operations for the initial rollout.
- Mutating or consequential operations require a separate, explicit confirmation flow as defined below.
- Each operation must have centralized, operation-specific timeouts, input/output limits, cancellation behavior, and retry rules. Retries must not duplicate non-idempotent actions.
- AI must not be a dependency for deterministic actions that can be safely performed without it.

## 5. One-time identity verification and per-operation PIN

The agreed user experience is **easy one-time bot verification**, followed by a **PIN for every sensitive operation**. This is a design requirement; it is not a claim that the flow is already implemented.

### 5.1 One-time linking

- The operator completes a simple, one-time identity-linking process that binds the verified platform-operator identity to the Telegram account.
- Linking must be based on a short-lived, single-use challenge and a trusted existing identity/administrative verification path—not on a Telegram username alone.
- Store the stable Telegram user ID and the verified operator association. Do not rely on a mutable display name or username as identity.
- Do not require the operator to repeat full account verification for every ordinary message once linking is complete.
- Provide a safe unlink/revoke and re-link process. Re-linking must invalidate the old association/session material.
- One-time linking establishes identity association only; it does **not** grant permissions permanently or bypass current backend authorization.

### 5.2 Sensitive-operation PIN

- Require the operator's PIN for **each sensitive operation**, not for every read-only question.
- Set up the PIN through a protected flow after identity linking. Never ask the user to send the PIN to the AI model.
- Store only a salted, purpose-appropriate password hash using a modern password-hashing/KDF implementation; never store or log plaintext PINs. Do not invent a custom hashing scheme.
- Verify the PIN server-side. Apply per-operator rate limits, escalating delays/temporary lockout, and security audit events for failures and recovery.
- PIN reset/recovery must use a separately verified recovery path; it must not be possible merely by knowing the Telegram account or username.
- Never include PINs, PIN hashes, one-time challenges, bot tokens, provider API keys, or other credentials in logs, prompts, analytics, or user-facing error messages.

### 5.3 Exact-operation confirmation

- Before a sensitive action, show a clear summary of exactly what will happen, including the target tenant/resource and material parameters, while respecting data-minimization rules.
- Bind the PIN approval and confirmation to that exact operation and its canonical parameters. Do not allow an approval for one action to authorize another action or changed parameters.
- Use a short-lived, single-use confirmation challenge/nonce. Expire it, consume it once, and reject replay or stale callbacks.
- Re-check identity association, platform scope, permissions, resource state, and relevant business rules at execution time—even after a correct PIN and confirmation.
- If the requested operation or its parameters change, require a new summary, PIN, and confirmation.
- A PIN is an additional confirmation factor; it is not a substitute for backend permissions or an override for policy.

## 6. Data protection, privacy, and audit

- Respect existing tenant isolation, platform scope, RLS, and backend authorization boundaries.
- Do not expose tenant customer names, identities, contact details, or other personal data through platform reports unless an existing approved policy explicitly permits the specific disclosure. The existing commercial aggregate reporting boundary must be preserved.
- Do not send personal or confidential data to an AI provider unless strictly necessary, permitted, and minimized.
- Record security-relevant events in the appropriate audit trail: linking/unlinking, PIN setup/reset, failed PIN attempts, sensitive-operation requests, approvals, rejections, execution outcomes, and provider/configuration changes.
- Audit records must not contain plaintext secrets or PINs. Include enough safe metadata to establish who initiated what, against which permitted resource, and the outcome.
- Treat Telegram messages, callback payloads, model output, and user-provided content as untrusted input. Validate schemas and canonicalize operation parameters server-side.

## 7. Reliability, abuse controls, and rollout

- Apply configurable rate and usage limits to the bot, AI provider, and individual operations.
- Set bounded timeouts and cancellation for Telegram requests, model calls, and backend tools. Long polling must have a timeout compatible with the Telegram long-poll duration.
- Handle provider/network failures gracefully; do not silently report an operation as successful when its result is unknown.
- Use idempotency or explicit operation-status reconciliation where retries could cause duplicate effects.
- Launch gradually with conservative permissions and read-focused capabilities, then expand only after tests and review.
- Provide a documented rollback/disable path that does not damage core Ticketty services.
- Keep secrets and runtime data on the server. GitHub is for source code and non-secret documentation only; do not commit Telegram/PostgreSQL credentials, provider keys, production data, or secret-bearing backups.

## 8. Existing system integration constraints

- Reuse the existing backend's platform authorization and service layer; do not duplicate platform permission logic inside the bot.
- Existing platform endpoints are protected by `platform.admin` and platform scope. Preserve these checks and the underlying constrained database operations/audit behavior.
- Tenant administration remains organization-scoped and governed by its existing permissions. Do not confuse tenant administration with platform administration.
- The deployment Remote Ops channel is a separate, constrained capability. Its HMAC, replay protection, expiry, and allowlist do not authorize unrelated platform actions.
- Any new backend endpoint/tool must have explicit authorization, scope validation, input validation, audit coverage, and tests.

## 9. Temporary password generation

- Temporary initial passwords generated in the platform tenant-provisioning UI must use a cryptographically secure random source, not `Math.random()`.
- Avoid ambiguous characters where practical and preserve the existing password format/validation contract unless tests and policy justify changing it.
- Never log or expose generated passwords beyond the intended one-time display/secure delivery flow.
- **Current code status:** the two `Math.random()` password-generation sites in `web/src/features/platform/platform-feature.tsx` were replaced with a helper using `crypto.getRandomValues()` on branch `feat/telegram-operations-assistant`. This change was committed separately; it has not been merged or deployed. Tests were not run as part of that edit.

## 10. Delivery and change-control rules

- Work on a dedicated branch and deliver changes through a reviewable pull request.
- Do not merge, deploy, or change production state without the user's explicit approval.
- Do not remove or weaken existing functionality, permissions, security controls, or tests to make the bot work.
- Before implementing each capability, inspect the current repository implementation and document the source-of-truth permission/service path.
- Add automated tests for authorization boundaries, tenant/platform isolation, PIN verification and throttling, challenge expiry/replay, parameter binding, failure handling, and non-AI fallback.
- Report honestly what is implemented, tested, committed, merged, and deployed. These are separate states.

## 11. Agreed implementation sequence

1. Audit the current bot identity/session handling, platform authorization/services, and audit patterns.
2. Design the one-time linking and PIN lifecycle against the existing identity model; choose established secure primitives already supported by the stack.
3. Implement server-side identity binding, PIN hashing/verification, throttling, recovery, and audit events.
4. Add operation-bound short-lived confirmation for sensitive actions, with authorization re-check at execution.
5. Connect only explicitly approved platform tools; keep AI outside the authorization decision.
6. Add automated security/integration tests and operational documentation.
7. Roll out gradually after review; no merge or deployment without explicit approval.

## Decision status

The sections above record the user's agreed product and security requirements. They are the source of truth for future Telegram Assistant work. Where the current code differs, treat the difference as implementation work—not as permission to weaken these decisions.


## 12. Previously agreed operational capabilities

The following scope was agreed in the earlier project discussions and is part of the intended assistant, subject to the authorization and confirmation rules above:

- Arabic operational assistant with intent parsing, secure pairing, and persisted authorization.
- Operational visibility such as service/status checks, health, alerts, and approved backup/runbook status.
- Alertmanager-to-Telegram alert delivery, with a separate webhook secret and authenticated/restricted endpoint. Alert replies should be understandable to a human, not raw infrastructure payloads.
- Controlled deployment lifecycle operations, including update and rollback, through a safe staged workflow—not direct commands.
- As applicable to the supported release workflow, expose clear operations corresponding to `/status`, `/alerts`, `/update`, and `/rollback`; natural language remains the primary interface.
- Long-running operations must be asynchronous, auditable, report progress, and expose an operation status/result rather than holding a Telegram request open indefinitely.
- Do not claim a backup, migration, deployment, health check, or rollback succeeded until the relevant system reports and verifies that result.

## 13. Deployment/update safety contract

For deployment actions, the previously agreed sequence is:

**Plan → Confirm → Backup → Migration → Deploy → Health Check**

- Show the proposed plan and impact before execution; require explicit confirmation for consequential actions.
- Use a known, approved release artifact/source. The intended production model is release-based deployment to the VPS, not arbitrary execution from a developer branch.
- Back up before risky changes and verify the backup result. Preserve the ability to diagnose and recover.
- Database migrations are forward-only in the automated deployment path. Do not automatically roll back PostgreSQL data/schema as if an application image rollback were safe.
- If a failure leaves data or deployment state uncertain, stop and report a recovery-required state (previously described as `RECOVERY_REQUIRED`) rather than attempting destructive repair.
- Rollback must be a separately planned and confirmed operation, with explicit limits; it must not imply database rollback.
- The bot must not run arbitrary shell, SQL, Docker commands, or unrestricted backend calls. It may invoke only the existing constrained Remote Ops operations.
- Deployment progress and each stage outcome must be visible and auditable. Preserve operation IDs and allow status inspection after Telegram/network interruptions.

## 14. Remote Ops security protocol

The existing deployment control plane is a narrow, separate interface. The prior agreement and implementation review covered:

- Local Unix-domain socket communication for the assistant-to-operations boundary.
- HMAC-SHA256 authentication, with timestamp, nonce/replay protection, request/operation ID, and authenticated operator identity.
- Strict operation allowlist; no arbitrary shell, SQL, Docker, or generic API execution.
- Short-lived plans/confirmations and validation of ownership, expiry, state, and parameters at execution time.
- Destructive or consequential operations require explicit confirmation.
- Auditability and replay protection are required and must be covered by tests.
- Keep this deployment control plane separate from platform administration tools. Do not broaden its allowlist to implement unrelated tenant/platform management.

## 15. Pairing, secrets, and runtime state

- Pairing/authorization must persist across a normal service restart/resume; routine installer resume must not unexpectedly invalidate a valid pairing.
- Pairing codes are secrets: do not expose them in logs or public output. If a code is exposed, revoke/rotate it before relying on the bot.
- Keep Telegram bot token, webhook/alert secret, HMAC material, provider API keys, and database credentials in server-side secret files or the approved secret mechanism—not source control.
- The Telegram service is isolated and hardened in Docker. The agreed deployment shape included a read-only filesystem, non-root execution, dropped capabilities/no-new-privileges, a dedicated persistent state location, and a health endpoint. Exact compose settings must be verified against the current source before changing them.
- Secret-file ownership and permissions must allow only the intended service/group to read them; diagnose access failures without printing secret contents.
- Do not delete persistent state, PostgreSQL volumes, or secret files as a troubleshooting shortcut. Preserve SSH and unrelated host services during installer/server work.

## 16. Monitoring, cloud, and infrastructure boundaries

- Integrate with the existing monitoring stack through Alertmanager and approved health/status endpoints; do not create a second, conflicting alerting authority.
- Alertmanager webhook authentication must use a separate secret and a restricted receiver path.
- Cloudflare or other infrastructure provisioning/reachability operations must be explicit, constrained, and separately authorized; do not imply that the Telegram bot can perform them unless an implemented allowlisted tool exists.
- Keep system/container hardening and monitoring integration covered by CI and operational checks.
- Telegram Assistant failure must not take down the web app, backend, database, or core Ticketty workflows.

## 17. Required security and quality tests

In addition to the PIN/linking tests listed above, the earlier agreed test scope includes:

- HMAC signature/authentication, timestamp validation, nonce replay rejection, request/operation identity, and expiry.
- Callback/button payload validation, stale/replayed callback rejection, and operation ownership/state validation.
- Permission enforcement at menu generation **and** execution; tenant/platform scope isolation; no cross-tenant access.
- Safe handling of malformed Arabic/natural-language input and model-generated tool arguments.
- Pairing flow, one-time use, persistence across restart/resume, revocation, and secret redaction.
- Deployment plan/confirm sequencing, stage transitions, cancellation/timeout behavior, idempotency, operation-status recovery, and failure/RECOVERY_REQUIRED paths.
- Alert webhook authentication and human-readable alert responses.
- Container hardening/health checks and CI coverage for parser, integration, and security behavior.

## 18. Installer and server lifecycle coordination

The assistant is part of the Ticketty server stack, but its lifecycle must follow the installer/deployment safety contract:

- Installer/update/resume must preserve existing secrets, PostgreSQL data/volumes, and valid Telegram pairing/state.
- Resume must continue from the last safe completed stage instead of repeating destructive or already successful work.
- A deployment must not import secrets or production database contents from GitHub/source bundles.
- Installer and bot must not silently regenerate or replace pairing credentials during resume.
- Server-side diagnostics must identify permission/runtime failures clearly without revealing secret values.
- Do not use the bot or installer to bypass release gates, migration checks, or explicit user approval.
