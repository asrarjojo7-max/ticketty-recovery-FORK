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

api_headers=(-H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
if [[ -s "$TOKEN_FILE" ]]; then
  token="$(tr -d "\r\n" < "$TOKEN_FILE")"
  api_headers+=(-H "Authorization: Bearer $token")
fi

release="$(curl -fsSL "${api_headers[@]}" "https://api.github.com/repos/$REPO/releases/tags/$REF")" || die "لم نستطع العثور على GitHub Release للوسم $REF."
tag_name="$(printf "%s" "$release" | jq -r ".tag_name // empty")"
[[ "$tag_name" == "$REF" ]] || die "الوسم المطلوب لا يطابق الـRelease."

ref_json="$(curl -fsSL "${api_headers[@]}" "https://api.github.com/repos/$REPO/git/ref/tags/$REF")" || die "تعذر قراءة Git tag."
tag_object_type="$(printf "%s" "$ref_json" | jq -r ".object.type // empty")"
tag_object_url="$(printf "%s" "$ref_json" | jq -r ".object.url // empty")"

if [[ "$tag_object_type" == "tag" && -n "$tag_object_url" ]]; then
  ref_json="$(curl -fsSL "${api_headers[@]}" "$tag_object_url")" || die "تعذر قراءة annotated tag."
  target_sha="$(printf "%s" "$ref_json" | jq -r ".object.sha // empty")"
else
  target_sha="$(printf "%s" "$ref_json" | jq -r ".object.sha // empty")"
fi

[[ "$target_sha" =~ ^[0-9a-f]{40}$ ]] || die "تعذر تحديد commit الـRelease."
checks="$(curl -fsSL "${api_headers[@]}" "https://api.github.com/repos/$REPO/commits/$target_sha/check-runs?per_page=100")" || die "تعذر قراءة نتائج CI للـcommit."
ci_count="$(printf "%s" "$checks" | jq "[.check_runs[] | select(.name | startswith(\"CI /\"))] | length")"
[[ "$ci_count" -gt 0 ]] || die "لا توجد نتائج CI على commit الإصدار $target_sha."

failed="$(printf "%s" "$checks" | jq "[.check_runs[] | select(.name | startswith(\"CI /\")) | select(.conclusion != \"success\")] | length")"
[[ "$failed" == "0" ]] || {
  echo "Release gate FAILED"
  printf "%s\n" "$checks" | jq -r ".check_runs[] | select(.name | startswith(\"CI /\")) | \"\(.name): \(.status)/\(.conclusion)\""
  exit 1
}

printf "Release gate PASS\n"
printf "Repository: %s\n" "$REPO"
printf "Release: %s\n" "$REF"
printf "Commit: %s\n" "$target_sha"
printf "%s\n" "$checks" | jq -r ".check_runs[] | select(.name | startswith(\"CI /\")) | \"CI: \(.name)\""