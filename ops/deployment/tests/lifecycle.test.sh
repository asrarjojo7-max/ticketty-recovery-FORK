#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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
env_set_missing NEW=value "$test_env"
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

echo "lifecycle tests: PASS (identity, env preservation, profile transfer, Cloudflare deferral)"
