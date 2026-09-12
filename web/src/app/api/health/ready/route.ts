import { getServerEnvironment } from "@/lib/server/env";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { apiBaseUrl } = getServerEnvironment();
    const response = await fetch(`${apiBaseUrl}/health/readiness`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });

    if (!response.ok) {
      throw new Error("Backend is not ready");
    }
    const result = (await response.json()) as {
      status?: "ready" | "degraded";
      accountingWorker?: { state?: string };
    };

    return NextResponse.json({
      status: result.status === "degraded" ? "degraded" : "ready",
      backend: "up",
      accountingWorker: result.accountingWorker?.state ?? "unknown",
    });
  } catch {
    return NextResponse.json(
      { status: "not_ready", backend: "down" },
      { status: 503 },
    );
  }
}
