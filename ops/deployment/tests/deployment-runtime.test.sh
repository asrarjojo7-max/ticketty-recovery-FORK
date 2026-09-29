#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TICKETTY="$ROOT/ticketty"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

extract_stack_up(){
  awk '/^stack_up\(\)/,/^ops_service\(\)/ {if ($0 !~ /^ops_service\(\)/) print}' "$TICKETTY"
}

assert_build_failure_is_reported(){
  local bin="$TMP/bin-build"
  local log="$TMP/build.log"
  mkdir -p "$bin"
  cat > "$bin/docker" <<'EOF'
#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$*" in
  *" build") exit 1 ;;
  *) exit 0 ;;
esac
EOF
  chmod 0755 "$bin/docker"

  eval "$(extract_stack_up)"
  export DOCKER_LOG="$log"
  PATH="$bin:$PATH"
  INSTALL_ROOT="$TMP/install-build"
  CLOUDFLARE_TOKEN_FILE="$TMP/no-cloudflare-token"

  set +e
  output="$(stack_up 2>&1)"
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || { echo "stack_up unexpectedly succeeded after Docker build failure" >&2; echo "$output" >&2; return 1; }
  grep -Fq "Docker image build failed." <<<"$output"
  ! grep -Fq "Services started" <<<"$output"
}

assert_startup_failure_is_reported(){
  local bin="$TMP/bin-start"
  local log="$TMP/start.log"
  mkdir -p "$bin"
  cat > "$bin/docker" <<'EOF'
#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >> "$DOCKER_LOG"
case "$*" in
  *" build") exit 0 ;;
  *" up "*) exit 1 ;;
  *) exit 0 ;;
esac
EOF
  chmod 0755 "$bin/docker"

  eval "$(extract_stack_up)"
  export DOCKER_LOG="$log"
  PATH="$bin:$PATH"
  INSTALL_ROOT="$TMP/install-start"
  CLOUDFLARE_TOKEN_FILE="$TMP/no-cloudflare-token"

  set +e
  output="$(stack_up 2>&1)"
  rc=$?
  set -e

  [[ "$rc" -ne 0 ]] || { echo "stack_up unexpectedly succeeded after service startup failure" >&2; echo "$output" >&2; return 1; }
  grep -Fq "Service startup failed." <<<"$output"
  ! grep -Fq "Services started" <<<"$output"
}

assert_progress_ui_is_present(){
  grep -Fq 'Building Docker images (live output)...' "$TICKETTY"
  grep -Fq 'printf "\n=== [%3d%%] [%d/%d] %s ===\n"' "$TICKETTY"
}

assert_build_failure_is_reported
assert_startup_failure_is_reported
assert_progress_ui_is_present
echo "deployment runtime tests: PASS (Docker failures propagate; progress UI present)"
