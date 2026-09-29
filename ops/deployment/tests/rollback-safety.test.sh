#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TICKETTY="$ROOT/ticketty"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

assert_rollback_blocked_after_migration(){
  local state="$TMP/state-block"
  local etc="$TMP/etc-block"
  mkdir -p "$state" "$etc/secrets"
  cat > "$state/state.env" <<'EOF'
PREVIOUS_RELEASE_REF=v2026.09.01
PREVIOUS_RELEASE_COMMIT=0123456789abcdef0123456789abcdef01234567
RELEASE_REF=v2026.10.01
LAST_UPDATE_MIGRATION_APPLIED=yes
DEPLOYMENT_STATUS=RECOVERY_REQUIRED
EOF
  set +e
  output="$(
    TICKETTY_INSTALL_ROOT="$TMP/root-block" \
    TICKETTY_ETC_ROOT="$etc" \
    TICKETTY_DEPLOYMENT_STATE_DIR="$state" \
    "$TICKETTY" rollback --non-interactive --confirm 2>&1
  )"
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || { echo "rollback unexpectedly allowed after migration" >&2; echo "$output" >&2; return 1; }
  grep -q "rollback محظور" <<<"$output"
}

assert_update_does_not_auto_checkout_old_after_migration(){
  local root="$TMP/fake-root"
  local state="$TMP/state-update"
  local etc="$TMP/etc-update"
  local git_log="$TMP/git.log"
  mkdir -p "$root/ops/deployment" "$state" "$etc/secrets"
  cat > "$root/ops/deployment/release-gate.sh" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
  chmod 700 "$root/ops/deployment/release-gate.sh"

  cat > "$state/state.env" <<'EOF'
RELEASE_REF=v2026.09.01
SERVER_ID=test-server
EOF

  # Load only the update_ref function; dependencies are stubbed below.
  eval "$(awk '/^update_ref\(\)/,/^rollback_ref\(\)/ {if ($0 !~ /^rollback_ref\(\)/) print}' "$TICKETTY")"

  INSTALL_ROOT="$root"
  STATE_DIR="$state"
  ETC_ROOT="$etc"
  STATE_FILE="$state/state.env"
  DRY_RUN=0

  get(){
    local key="$1"
    awk -F= -v k="$key" '$1==k{sub(/^[^=]*=/,"");print;exit}' "$STATE_FILE" 2>/dev/null
  }
  setv(){
    local key="$1" value="$2" tmp
    tmp="$(mktemp "$STATE_DIR/state.XXXXXX")"
    [[ -f "$STATE_FILE" ]] && awk -F= -v k="$key" '$1!=k{print}' "$STATE_FILE" > "$tmp" || true
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
    mv "$tmp" "$STATE_FILE"
  }
  ensure_checkout(){ :; }
  clean(){ :; }
  prebackup(){ :; }
  current_release(){ printf '%s\n' 'v2026.09.01'; }
  stack_up(){ return 1; }
  health(){ return 0; }
  git(){
    printf '%s\n' "$*" >> "$git_log"
    case "$*" in
      *"rev-parse HEAD") printf '%s\n' '0123456789abcdef0123456789abcdef01234567' ;;
      *"rev-parse refs/tags/v2026.10.01") return 0 ;;
      *"checkout --detach v2026.10.01") return 0 ;;
      *) return 0 ;;
    esac
  }

  set +e
  update_ref v2026.10.01 >/dev/null 2>&1
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || { echo "update unexpectedly succeeded with failed stack_up" >&2; return 1; }
  grep -q "checkout --detach v2026.10.01" "$git_log"
  ! grep -q "checkout --detach 0123456789abcdef0123456789abcdef01234567" "$git_log"
  [[ "$(get DEPLOYMENT_STATUS)" == "RECOVERY_REQUIRED" ]]
}

assert_rollback_blocked_after_migration
assert_update_does_not_auto_checkout_old_after_migration
echo "rollback safety tests: PASS (post-migration rollback blocked, automatic old-code checkout blocked)"
