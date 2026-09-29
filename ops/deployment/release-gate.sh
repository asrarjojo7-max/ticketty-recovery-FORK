#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG_ENV="${TICKETTY_ENV_FILE:-/etc/ticketty/ticketty.env}"
REPO="${TICKETTY_GITHUB_REPOSITORY:-}"
if [[ -z "$REPO" && -f "$CONFIG_ENV" ]]; then REPO="$(grep "^TICKETTY_GITHUB_REPOSITORY=" "$CONFIG_ENV" | cut -d= -f2- || true)"; fi
REF="${1:-}"
TOKEN_FILE="${GITHUB_READONLY_TOKEN_FILE:-/etc/ticketty/secrets/github-readonly-token}"
die(){ echo "ERROR: $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "$1 is required."; }

[[ -n "$REPO" ]] || die "TICKETTY_GITHUB_REPOSITORY is not configured."
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "Invalid GitHub repository name."
[[ -n "$REF" ]] || die "Release tag is required."
[[ "$REF" =~ ^v?[0-9][A-Za-z0-9._+-]*$ ]] || die "Invalid Release tag."
need curl
need jq

headers=(-H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
if [[ -s "$TOKEN_FILE" ]]; then
  token="$(tr -d "\r\n" < "$TOKEN_FILE")"
  headers+=(-H "Authorization: Bearer $token")
fi

release="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/releases/tags/$REF")" || die "GitHub Release not found for tag $REF."
[[ "$(printf "%s" "$release" | jq -r ".tag_name // empty")" == "$REF" ]] || die "اسم Release لا يطابق الوسم الis required."

ref_json="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/git/ref/tags/$REF")" || die "Unable to read Git tag."
object_type="$(printf "%s" "$ref_json" | jq -r ".object.type // empty")"
object_url="$(printf "%s" "$ref_json" | jq -r ".object.url // empty")"
if [[ "$object_type" == "tag" && -n "$object_url" ]]; then
  tag_json="$(curl -fsSL "${headers[@]}" "$object_url")" || die "Unable to read annotated tag."
  commit_sha="$(printf "%s" "$tag_json" | jq -r ".object.sha // empty")"
else
  commit_sha="$(printf "%s" "$ref_json" | jq -r ".object.sha // empty")"
fi
[[ "$commit_sha" =~ ^[0-9a-f]{40}$ ]] || die "Unable to determine release commit."

runs="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/actions/runs?head_sha=$commit_sha&per_page=100")" || die "Unable to read GitHub Actions."
run_id="$(printf "%s" "$runs" | jq -r "[.workflow_runs[] | select(.name == \"CI\") | .id] | .[0] // empty")"
[[ "$run_id" =~ ^[0-9]+$ ]] || die "No CI run exists for the selected commit."
run_json="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/actions/runs/$run_id")" || die "Unable to read CI run."
[[ "$(printf "%s" "$run_json" | jq -r ".head_sha")" == "$commit_sha" ]] || die "CI does not match the release commit."
[[ "$(printf "%s" "$run_json" | jq -r ".status")" == "completed" ]] || die "CI has not completed yet."
[[ "$(printf "%s" "$run_json" | jq -r ".conclusion")" == "success" ]] || {
  echo "Release gate FAILED: CI conclusion=$(printf "%s" "$run_json" | jq -r ".conclusion")"
  exit 1
}

jobs="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/actions/runs/$run_id/jobs?per_page=100")" || die "Unable to read CI jobs."
job_count="$(printf "%s" "$jobs" | jq "[.jobs[]] | length")"
[[ "$job_count" -gt 0 ]] || die "CI run contains no jobs."
failed_jobs="$(printf "%s" "$jobs" | jq "[.jobs[] | select(.conclusion != \"success\")] | length")"
[[ "$failed_jobs" == "0" ]] || {
  echo "Release gate FAILED: one or more CI jobs are not successful."
  printf "%s\n" "$jobs" | jq -r ".jobs[] | \"\(.name): \(.status)/\(.conclusion)\""
  exit 1
}

printf "Release gate PASS\n"
printf "Repository: %s\n" "$REPO"
printf "Release: %s\n" "$REF"
printf "Commit: %s\n" "$commit_sha"
printf "CI run: %s\n" "$run_id"
printf "%s\n" "$jobs" | jq -r ".jobs[] | \"CI: \(.name) — \(.conclusion)\""