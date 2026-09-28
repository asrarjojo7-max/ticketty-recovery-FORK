#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REPO="${TICKETTY_GITHUB_REPOSITORY:-}"
REF="${1:-}"
TOKEN_FILE="${GITHUB_READONLY_TOKEN_FILE:-/etc/ticketty/secrets/github-readonly-token}"
die(){ echo "ERROR: $*" >&2; exit 1; }
need(){ command -v "$1" >/dev/null 2>&1 || die "$1 مطلوب."; }

[[ -n "$REPO" ]] || die "TICKETTY_GITHUB_REPOSITORY غير مضبوط."
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "اسم GitHub repository غير صالح."
[[ -n "$REF" ]] || die "Release tag مطلوب."
[[ "$REF" =~ ^v?[0-9][A-Za-z0-9._+-]*$ ]] || die "Release tag غير صالح."
need curl
need jq

headers=(-H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
if [[ -s "$TOKEN_FILE" ]]; then
  token="$(tr -d "\r\n" < "$TOKEN_FILE")"
  headers+=(-H "Authorization: Bearer $token")
fi

release="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/releases/tags/$REF")" || die "GitHub Release غير موجود للوسم $REF."
[[ "$(printf "%s" "$release" | jq -r ".tag_name // empty")" == "$REF" ]] || die "اسم Release لا يطابق الوسم المطلوب."

ref_json="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/git/ref/tags/$REF")" || die "تعذر قراءة Git tag."
object_type="$(printf "%s" "$ref_json" | jq -r ".object.type // empty")"
object_url="$(printf "%s" "$ref_json" | jq -r ".object.url // empty")"
if [[ "$object_type" == "tag" && -n "$object_url" ]]; then
  tag_json="$(curl -fsSL "${headers[@]}" "$object_url")" || die "تعذر قراءة annotated tag."
  commit_sha="$(printf "%s" "$tag_json" | jq -r ".object.sha // empty")"
else
  commit_sha="$(printf "%s" "$ref_json" | jq -r ".object.sha // empty")"
fi
[[ "$commit_sha" =~ ^[0-9a-f]{40}$ ]] || die "تعذر تحديد commit الإصدار."

runs="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/actions/runs?head_sha=$commit_sha&per_page=100")" || die "تعذر قراءة GitHub Actions."
run_id="$(printf "%s" "$runs" | jq -r "[.workflow_runs[] | select(.name == \"CI\") | .id] | .[0] // empty")"
[[ "$run_id" =~ ^[0-9]+$ ]] || die "لا يوجد تشغيل CI للـcommit المحدد."
run_json="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/actions/runs/$run_id")" || die "تعذر قراءة تشغيل CI."
[[ "$(printf "%s" "$run_json" | jq -r ".head_sha")" == "$commit_sha" ]] || die "CI لا يطابق commit الإصدار."
[[ "$(printf "%s" "$run_json" | jq -r ".status")" == "completed" ]] || die "CI لم يكتمل بعد."
[[ "$(printf "%s" "$run_json" | jq -r ".conclusion")" == "success" ]] || {
  echo "Release gate FAILED: CI conclusion=$(printf "%s" "$run_json" | jq -r ".conclusion")"
  exit 1
}

jobs="$(curl -fsSL "${headers[@]}" "https://api.github.com/repos/$REPO/actions/runs/$run_id/jobs?per_page=100")" || die "تعذر قراءة وظائف CI."
job_count="$(printf "%s" "$jobs" | jq "[.jobs[]] | length")"
[[ "$job_count" -gt 0 ]] || die "تشغيل CI لا يحتوي وظائف."
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