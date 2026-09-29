#!/usr/bin/env bash
set -Eeuo pipefail
trap 'rc=$?; echo "lifecycle test failed: line $LINENO: $BASH_COMMAND (rc=$rc)" >&2' ERR

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_ROOT="$(cd "$ROOT/../.." && pwd)"
TICKETTY="$ROOT/ticketty"
PROFILE="$ROOT/profile.sh"
TRANSFER="$ROOT/transfer.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ETC_ROOT="$TMP/etc"
STATE_ROOT="$TMP/state"
install -d -m 0700 "$ETC_ROOT" "$STATE_ROOT"
printf '%s\n' \
  'TICKETTY_GITHUB_REPOSITORY=example/ticketty' \
  'TICKETTY_INSTALL_ROOT=/srv/ticketty' \
  'APP_ORIGIN=https://ticketty.example' \
  'TICKETTY_RELEASE_CHANNEL=stable' > "$ETC_ROOT/ticketty.env"
printf '%s\n' 'SERVER_ID=machine-source-123' > "$STATE_ROOT/state.env"

# Exercise the pure guard functions without executing ticketty's main command path.
eval "$(awk '/^server_identity\(\)/,/^\}$/ {print}' "$TICKETTY")"
eval "$(awk '/^env_set_missing\(\)/,/^\}$/ {print}' "$TICKETTY")"

server_id="$(TICKETTY_SERVER_ID=explicit-test server_identity)"
[[ "$server_id" == "explicit-test" ]]

test_env="$TMP/test.env"
printf '%s\n' 'EXISTING=keep-me' > "$test_env"
env_set_missing EXISTING changed "$test_env"
env_set_missing NEW value "$test_env"
[[ "$(grep '^EXISTING=' "$test_env" | cut -d= -f2-)" == "keep-me" ]]
[[ "$(grep '^NEW=' "$test_env" | cut -d= -f2-)" == "value" ]]

TICKETTY_ETC_ROOT="$ETC_ROOT" TICKETTY_DEPLOYMENT_STATE_DIR="$STATE_ROOT" \
  "$PROFILE" export "$STATE_ROOT/ticketty-profile.json" >/dev/null
[[ "$(jq -r '.server_id' "$STATE_ROOT/ticketty-profile.json")" == "machine-source-123" ]]
[[ "$(jq -r '.secrets_included' "$STATE_ROOT/ticketty-profile.json")" == "false" ]]

TARGET_STATE="$TMP/target-state"
install -d -m 0700 "$TARGET_STATE"
TICKETTY_ETC_ROOT="$ETC_ROOT" TICKETTY_DEPLOYMENT_STATE_DIR="$TARGET_STATE" \
  "$PROFILE" import "$STATE_ROOT/ticketty-profile.json" >/dev/null
[[ "$(grep '^SERVER_ID=' "$TARGET_STATE/state.env" 2>/dev/null | cut -d= -f2- || true)" == "" ]]
[[ "$(grep '^PROJECT_DIR=' "$TARGET_STATE/state.env" | cut -d= -f2-)" == "/srv/ticketty" ]]

# Transfer import must be wired through ticketty to apply the profile after extraction.
grep -q 'ops/deployment/profile.sh" import "\$STATE_DIR/ticketty-profile.json"' "$TICKETTY"

# Deferred Cloudflare is persisted and accepted by phase verification.
grep -q 'setv CLOUDFLARE_STATUS DEFERRED' "$TICKETTY"
grep -q 'CLOUDFLARE) \[\[ -s "\$CLOUDFLARE_TOKEN_FILE" || "\$(get CLOUDFLARE_STATUS' "$TICKETTY"

# Transfer import is usable before ticketty.env exists on a fresh target.
BUNDLE="$TMP/ticketty-transfer.tar.gz"
printf "%s\n" \
  "Ticketty Transfer Bundle" \
  "schema_version=1" \
  "server_id=machine-source-123" \
  "release=v2026.10.01" \
  "commit=0123456789abcdef0123456789abcdef01234567" \
  "latest_migration=test" \
  "secrets_included=false" \
  "database_included=false" > "$STATE_ROOT/transfer-manifest.txt"
tar -czf "$BUNDLE" -C "$STATE_ROOT" ticketty-profile.json transfer-manifest.txt
sha256sum "$BUNDLE" > "$BUNDLE.sha256"
IMPORT_STATE="$TMP/import-state"
TICKETTY_INSTALL_ROOT="$INSTALL_ROOT" TICKETTY_ETC_ROOT="$TMP/fresh-etc" TICKETTY_DEPLOYMENT_STATE_DIR="$IMPORT_STATE" \
  "$TRANSFER" import "$BUNDLE" >/dev/null
[[ "$(grep "^TRANSFER_SOURCE_RELEASE=" "$IMPORT_STATE/state.env" | cut -d= -f2-)" == "v2026.10.01" ]]
[[ "$(grep "^TRANSFER_SOURCE_COMMIT=" "$IMPORT_STATE/state.env" | cut -d= -f2-)" == "0123456789abcdef0123456789abcdef01234567" ]]
grep -q 'target="$(get TRANSFER_SOURCE_RELEASE 2>/dev/null || true)"' "$TICKETTY"

echo "lifecycle tests: PASS (identity, env preservation, profile transfer, release preservation, Cloudflare deferral)"


# New installs must default to the canonical repository used by this repository.
grep -q 'REPO="${TICKETTY_REPOSITORY_URL:-https://github.com/mogahedadamy/ticketty-recovery.git}"' "$INSTALL_ROOT/install.sh"
grep -q 'repo="${TICKETTY_REPOSITORY_URL:-https://github.com/mogahedadamy/ticketty-recovery.git}"' "$INSTALL_ROOT/ops/deployment/bootstrap.sh"
grep -q 'DEFAULT_REPO="https://github.com/mogahedadamy/ticketty-recovery.git"' "$TICKETTY"
grep -q 'env_set_missing TICKETTY_GITHUB_REPOSITORY "${TICKETTY_GITHUB_REPOSITORY:-mogahedadamy/ticketty-recovery}"' "$TICKETTY"
grep -q 'TICKETTY_GITHUB_REPOSITORY=mogahedadamy/ticketty-recovery' "$TICKETTY"
grep -q 'git -C "\$ROOT" fetch --force "\$REPO" master' "$INSTALL_ROOT/install.sh"
grep -q 'git -C "\$ROOT" show FETCH_HEAD:ops/deployment/ticketty > /usr/local/bin/ticketty' "$INSTALL_ROOT/install.sh"

# A completed installation must use the same installer command as a safe update entrypoint.
grep -q 'previous_status="$(get DEPLOYMENT_STATUS 2>/dev/null || true)"' "$TICKETTY"
grep -q 'previous_status" == READY && -z "$REF"' "$TICKETTY"
grep -q 'update_plan="$(plan_json)"' "$TICKETTY"
grep -q 'update_ref "$update_target"' "$TICKETTY"
