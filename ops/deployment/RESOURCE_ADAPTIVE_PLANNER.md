# Adaptive VPS Resource Planner

This module is a read-only discovery and deterministic planning foundation for the Ticketty installer.

## Contract
- Never assumes a fixed VPS size. Discovery reads host RAM/CPU, available disk for Docker data (falling back to /), finite cgroup memory limits, and CPU quota.
- Effective memory is the lower of host memory and a detected finite cgroup memory limit. Effective CPU is the lower of the visible CPU count and finite cgroup quota, reported in millicores (1000 = 1 CPU).
- Supports cgroup v2 `cpu.max` and v1 `cpu.cfs_quota_us/cpu.cfs_period_us`; quota values below one CPU are rounded up to 1 millicore to avoid treating a runnable constrained container as zero CPU.
- Docker daemon memory/CPU are reported separately when available; they are not silently treated as host capacity.
- Planning is pure: `plan <effective-memory-kib> <effective-cpu-millicores> <available-disk-kib>` emits JSON and changes no files or services.
- Profiles are recommendations, not hard-coded hardware requirements. A constrained result blocks deployment pending operator review; it does not weaken security or data-integrity gates.
- Every plan requires explicit operator confirmation before a future integration applies it.
- Worker count remains one in every profile until load/soak evidence validates scaling; this is not a production capacity claim.
- The planner does not set Docker resource limits, alter worker flags, resize PostgreSQL, change retention, or mutate existing installations.

## Initial profile policy
- constrained: below 1.5 GiB effective RAM or below 5 GiB available disk; decision=blocked.
- minimal: below 4 GiB RAM or below 2 effective CPUs; decision=review.
- standard: below 8 GiB RAM or below 4 effective CPUs; one worker.
- high-capacity: otherwise; one worker pending workload evidence.
These thresholds are initial policy values and must be validated against load/soak tests before production adoption. No profile changes mandatory security, backup, migration, restore, or verification gates.

## Use
```bash
bash ops/deployment/resource-profile.sh discover
bash ops/deployment/resource-profile.sh plan 4194304 2000 20971520
bash ops/deployment/tests/resource-profile.test.sh
```

## Installer integration still required
The installer must invoke discovery during preflight, display the plan in its Arabic terminal wizard, persist the accepted profile idempotently, and re-evaluate on a new VPS or explicit reconfigure. It must not overwrite secrets, database volumes, Telegram pairing, or completed state. Updates on the same VPS must not silently change the accepted profile. This PR intentionally does not apply resource settings to Compose.
