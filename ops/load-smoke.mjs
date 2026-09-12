#!/usr/bin/env node
/**
 * Bounded HTTP load smoke test. This is not a capacity claim: it provides a
 * reproducible latency/error baseline for a specified environment and path set.
 */
const baseUrl = process.env.LOAD_BASE_URL;
if (!baseUrl) throw new Error("LOAD_BASE_URL is required");
const paths = (process.env.LOAD_PATHS ?? "/api/health/liveness")
  .split(",")
  .map((path) => path.trim())
  .filter(Boolean);
const requestsPerPath = Number(process.env.LOAD_REQUESTS_PER_PATH ?? "100");
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? "10");
const maxErrorRate = Number(process.env.LOAD_MAX_ERROR_RATE ?? "0.01");
const token = process.env.LOAD_BEARER_TOKEN;

if (!Number.isInteger(requestsPerPath) || requestsPerPath < 1) {
  throw new Error("LOAD_REQUESTS_PER_PATH must be a positive integer");
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 200) {
  throw new Error("LOAD_CONCURRENCY must be between 1 and 200");
}

function percentile(sorted, quantile) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

let failed = false;
for (const path of paths) {
  const durations = [];
  const statuses = new Map();
  let cursor = 0;
  const started = performance.now();

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= requestsPerPath) return;
      const requestStarted = performance.now();
      try {
        const response = await fetch(new URL(path, baseUrl), {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: AbortSignal.timeout(15_000),
        });
        await response.arrayBuffer();
        statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      } catch {
        statuses.set(0, (statuses.get(0) ?? 0) + 1);
      } finally {
        durations.push(performance.now() - requestStarted);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const elapsedSeconds = (performance.now() - started) / 1000;
  durations.sort((a, b) => a - b);
  const errors = [...statuses.entries()]
    .filter(([status]) => status < 200 || status >= 400)
    .reduce((sum, [, count]) => sum + count, 0);
  const result = {
    path,
    requests: requestsPerPath,
    concurrency,
    throughputPerSecond: Number((requestsPerPath / elapsedSeconds).toFixed(2)),
    latencyMs: {
      p50: Number(percentile(durations, 0.5).toFixed(2)),
      p95: Number(percentile(durations, 0.95).toFixed(2)),
      p99: Number(percentile(durations, 0.99).toFixed(2)),
    },
    errorRate: Number((errors / requestsPerPath).toFixed(4)),
    statuses: Object.fromEntries([...statuses.entries()].sort(([a], [b]) => a - b)),
  };
  console.log(JSON.stringify(result));
  if (result.errorRate > maxErrorRate) failed = true;
}

if (failed) process.exitCode = 1;
