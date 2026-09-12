# Performance Baseline — 2026-09-12

## Scope and limitations

This is a **single-host local smoke/load measurement**, not a production capacity certification. The API was a compiled NestJS production process using the least-privilege `ticketty_runtime` PostgreSQL login on localhost. PostgreSQL was local. Requests used 10 concurrent clients and 100 requests per route.

Command:

```bash
LOAD_BASE_URL=http://127.0.0.1:4101 \
LOAD_PATHS='/api/health/liveness,/api/trips?limit=20,/api/reports/dashboard' \
LOAD_REQUESTS_PER_PATH=100 LOAD_CONCURRENCY=10 \
LOAD_BEARER_TOKEN='<redacted>' node ops/load-smoke.mjs
```

## Results

| Route | Requests | Concurrency | Throughput req/s | p50 ms | p95 ms | p99 ms | Error rate |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/api/health/liveness` | 100 | 10 | 175.28 | 29.29 | 181.21 | 274.24 | 0% |
| `/api/trips?limit=20` | 100 | 10 | 95.05 | 96.70 | 157.17 | 192.22 | 0% |
| `/api/reports/dashboard` | 100 | 10 | 60.32 | 139.95 | 332.63 | 356.07 | 0% |

Observed backend peak RSS was **157,980 KiB**, sampled peak process CPU was **0.6%**, and PostgreSQL reported **7 connections** immediately after the run. Host contention and local sampling make the CPU figure indicative only.

## Database evidence and remediation

The dashboard uses organization-wide time-range queries for bookings, payments, and tickets. Before this cycle only branch/time or unrelated organization indexes existed for these paths. Migration `20260914130000_dashboard_query_indexes` adds:

- `bookings("organizationId", "createdAt")`
- `payments("organizationId", "createdAt")`
- `tickets("organizationId", "createdAt")`

`EXPLAIN (ANALYZE, BUFFERS)` with sequential scans disabled to prove index applicability produced:

- seven-day payment aggregate: bitmap index scan on `payments_organizationId_createdAt_idx`, execution 1.494 ms;
- recent bookings ordered/limited: backward index scan on `bookings_organizationId_createdAt_idx`, execution 0.047 ms;
- today's ticket count: bitmap index scan on `tickets_organizationId_createdAt_idx`, execution 0.054 ms.

The current development dataset is small, so normal planner choices are not evidence of production-scale benefit. The index shapes are justified by exact production query predicates and the dashboard's measured highest p95 among sampled routes.

## Interpretation

- No errors occurred at this modest load.
- Dashboard latency is the first measured optimization target; it performs 14 concurrent queries and limited in-memory shaping.
- These numbers do **not** establish supported company/user counts, saturation throughput, multi-instance behavior, WAN latency, or production database capacity.
- Before general availability, rerun the script and domain-specific write scenarios against production-like data volume while recording container CPU/memory, PostgreSQL query latency, connection saturation, and lock waits.
