#!/usr/bin/env bash
# Read-only VPS resource discovery and deterministic Ticketty profile planning.
set -Eeuo pipefail
LC_ALL=C
die(){ echo "ERROR: $*" >&2; exit 2; }
mem_kib(){ awk '/MemTotal:/ {print $2; exit}' /proc/meminfo 2>/dev/null || echo 0; }
cpu_count(){ nproc 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1; }
disk_kib(){ df -Pk "${1:-/}" 2>/dev/null | awk 'NR==2 {print $4; exit}'; }
cgroup_limit_kib(){
  local f v
  for f in /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory/memory.limit_in_bytes; do
    [[ -r "$f" ]] || continue
    read -r v < "$f" || continue
    if [[ "$v" =~ ^[0-9]+$ ]] && (( v > 0 && v < 1152921504606846976 )); then echo $((v/1024)); return; fi
  done
  echo 0
}
discover(){
  local host_mem host_cpu limit effective disk docker_mem docker_cpu
  host_mem="$(mem_kib)"; host_cpu="$(cpu_count)"; limit="$(cgroup_limit_kib)"
  [[ "$host_mem" =~ ^[0-9]+$ && "$host_cpu" =~ ^[0-9]+$ ]] || die "تعذر قراءة موارد النظام."
  (( host_mem > 0 && host_cpu > 0 )) || die "قيم الموارد غير صالحة."
  effective="$host_mem"; (( limit > 0 && limit < effective )) && effective="$limit"
  disk="$(disk_kib /var/lib/docker)"; [[ "$disk" =~ ^[0-9]+$ ]] || disk="$(disk_kib /)"
  docker_mem="unknown"; docker_cpu="unknown"
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker_mem="$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo unknown)"
    docker_cpu="$(docker info --format '{{.NCPU}}' 2>/dev/null || echo unknown)"
  fi
  printf '{"schema_version":1,"host_memory_kib":%s,"effective_memory_kib":%s,"cgroup_memory_limit_kib":%s,"host_cpu_count":%s,"available_disk_kib":%s,"docker_memory_bytes":"%s","docker_cpu_count":"%s"}\n' "$host_mem" "$effective" "$limit" "$host_cpu" "${disk:-0}" "$docker_mem" "$docker_cpu"
}
plan(){
  local mem="$1" cpu="$2" disk="$3" tier workers monitoring status
  for x in "$mem" "$cpu" "$disk"; do [[ "$x" =~ ^[0-9]+$ ]] || die "مدخلات الموارد يجب أن تكون أعدادًا صحيحة."; done
  (( mem > 0 && cpu > 0 && disk >= 0 )) || die "موارد غير صالحة."
  # Resource tiers are recommendations, never a substitute for required safety gates.
  if (( mem < 1536*1024 || disk < 5*1024*1024 )); then tier=constrained; workers=1; monitoring=minimal; status=blocked
  elif (( mem < 4096*1024 || cpu < 2 )); then tier=minimal; workers=1; monitoring=local; status=review
  elif (( mem < 8192*1024 || cpu < 4 )); then tier=standard; workers=1; monitoring=standard; status=ready
  else tier=high-capacity; workers=2; monitoring=standard; status=ready; fi
  printf '{"schema_version":1,"profile":"%s","decision":"%s","recommended_workers":%s,"monitoring_profile":"%s","effective_memory_kib":%s,"cpu_count":%s,"available_disk_kib":%s,"requires_operator_confirmation":true,"safety_gates_unchanged":true}\n' "$tier" "$status" "$workers" "$monitoring" "$mem" "$cpu" "$disk"
}
case "${1:-}" in
  discover) discover;;
  plan) [[ $# == 4 ]] || die "usage: resource-profile.sh plan <memory-kib> <cpu-count> <disk-kib>"; plan "$2" "$3" "$4";;
  *) die "usage: resource-profile.sh {discover|plan <memory-kib> <cpu-count> <disk-kib>}";;
esac
