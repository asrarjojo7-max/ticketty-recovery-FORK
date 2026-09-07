# Security Incident Report — Credentials Exposed in URL

**Date:** 2026-09-07 · **Severity:** CRITICAL · **Status:** RESOLVED · **Discovered by:** Owner (security testing on the live preview domain)

## Summary

On the dev-preview domain (`https://app.suda-technologies.com`), submitting the login form caused the browser to navigate to `/?email=...&password=...` — the plaintext password entered the URL, browser history, and every log that records URLs.

## Root Cause (verified end-to-end)

Three independent findings combined; no layer intentionally put credentials in a URL:

1. **Trigger (frontend, structural):** the login `<form>` had no `method` attribute. Native HTML default is **GET**. The `onSubmit` JavaScript handler (which sends `POST /api/session` with a JSON body) normally overrides this — so the leak appeared only when JavaScript did not run.
2. **Enabler (Next.js 16 dev server):** `block-cross-site-dev` — a built-in CSRF protection — rejected browser requests to `/_next/static/chunks/*` whose `Origin` header was the tunnel domain, returning **403** for the hydration chunks. React never attached to the page (verified: 3 failed chunk requests, `isHydrated = false`, no `POST /api/session` fired). With React dead, the form fell back to its native behavior: a GET submission carrying `email` and `password` as query parameters. (curl did not reproduce the 403 because it sends no `Origin` header — the bug was browser-only.)
3. **The BFF, backend, and Cloudflare were innocent:** the session route already required a trusted `Origin` and posted credentials as a JSON body to the backend; the backend accepts `@Body` only (no `@Query`); the tunnel did not rewrite anything. Verified by tracing the full flow and by comparing served HTML/JS/network logs.

## Fix (architectural, multi-layer)

1. **`next.config.ts` — `allowedDevOrigins: ["app.suda-technologies.com"]`** (env-overridable via `DEV_ALLOWED_ORIGINS`): the dev server now accepts the tunnel origin for dev assets, so hydration succeeds. The 403s are gone (verified live).
2. **`login-form.tsx` — `method="POST"` + `action="/api/session"`**: structural guarantee. Even if hydration fails again for any reason (CSP change, extension, deploy error), the browser can only submit via POST; a GET fallback with credentials is now impossible by construction.
3. **`/api/session` route — no-JS progressive enhancement:** accepts `application/x-www-form-urlencoded` submits (non-JSON), performs the same trusted-origin check, authenticates via the backend, sets the HttpOnly session cookie, and responds **303 → /dashboard** (or `/?error=1` on failure) — redirects never echo credentials.
4. **`web/.env.local` — `APP_ORIGIN_ALT=https://app.suda-technologies.com`**: the BFF accepts the tunnel origin (previously the POST reached the BFF but was 403-rejected, which would have forced debugging in the wrong layer again).

## Verification (all performed on the live domain)

- Full login flow traced through DevTools-equivalent instrumentation: `POST /api/session` with credentials in the body only; **zero** credential-bearing URLs in any request; final URL clean.
- No-JS simulation (`requestSubmit()` before hydration): submission is POST to `/api/session`; URL stays clean.
- Backend logs contain method+path+status only (no bodies); no credential strings in any application log.
- Automated regression added: `web/e2e/credential-leak.spec.ts` (2 tests) — fails the suite if credentials ever appear in a URL, if the login stops using POST, or if the form regresses to GET. Runs in the local suite and in CI (`web-e2e` job).
- Full gates after the fix: lint, typecheck, 13/13 vitest, **10/10 Playwright**, production build.

## Credential rotation

The credential used in testing (`e2e-owner@ticketty.local`) is a dedicated E2E fixture account, not a real user credential. Its password is rotated by re-running `pnpm e2e:setup` (regenerates a fresh bcrypt hash). Real user passwords were never exposed by this bug — the leak depended on each user typing their password into the form while hydration was broken. **Action for owner:** rotate any account that was logged into through the tunnel domain during 2026-09-07 before the fix, and treat browser history entries on machines that used the preview domain during that window as containing plaintext passwords.

## Post-fix follow-up (2026-09-07, second pass)

The owner reported the Next.js dev indicator showing 2 issues on the tunnel after the fix. Both were investigated and resolved:

1. **React dev `eval()` blocked by CSP** — React's development build requires `eval()` for stack-frame reconstruction (production React does not). Fixed in `next.config.ts`: `'unsafe-eval'` is appended to `script-src` **only when `NODE_ENV !== "production"`**. Verified: the production build's `routes-manifest.json` contains `script-src 'self' 'unsafe-inline'` — no `unsafe-eval` — so production CSP remains fully hardened. The dev server now serves `script-src 'self' 'unsafe-inline' 'unsafe-eval'`.
2. **Hydration mismatch on the login form** (server lacked `action`/`method`, client had them) — this was a stale-module window: the dev server had cached pre-fix server markup while the Turbopack client bundle already carried the fix (the "Next.js 16.3.2 (stale)" indicator pointed at the same stale `.next` state). Resolved by a clean dev-server restart with `.next` removed. Verified: server-rendered HTML, source, and live DOM all show `<form class="login-form" action="/api/session" method="POST">`; console is clean (zero errors/warnings) on both localhost and the tunnel domain.

Re-verification after the cleanup (all through the live domain where applicable):
- Credential-leak regression suite re-run: 4/4 pass (both tests), including a strengthened assertion that the **server-rendered HTML** itself carries `action="/api/session"` + `method="POST"` (locked in before any JS runs).
- Login is `POST /api/session` with body-only credentials; no URL in the entire flow contains a credential.
- Native/no-JS submission remains safe (POST to /api/session, URL stays clean).
- Application logs (web dev server, both backend instances) scanned: zero credential occurrences.
- Full gates: lint, typecheck, 13/13 vitest, 10/10 Playwright (including the 2 security regression tests), production build green.

## Log hygiene confirmation

The backend completion logger emits `{requestId, method, path, statusCode, clientIp, durationMs}` — no query strings (the Nest logger records `request.path` without the search string for POSTs; GETs carry no credentials in this app). The Next.js BFF does not log request bodies. Cloudflare tunnel logs were not accessible from the machine (no API token); the owner may check the Cloudflare dashboard — any logged URLs from the incident window may contain credentials and should be aged out per the plan's retention settings.
