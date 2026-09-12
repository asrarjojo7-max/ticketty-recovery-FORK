import {
  getServerEnvironment,
  trustedOrigins,
} from "@/lib/server/env";
import {
  hasTrustedOrigin,
  requestIdFrom,
  trustedClientIp,
} from "@/lib/server/request-security";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "ticketty_session";
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/;
const INTERNAL_ONLY_ROOTS = new Set(["health", "metrics"]);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const requestId = requestIdFrom(request.headers);
  const environment = getServerEnvironment();
  const { path } = await context.params;
  const method = request.method;

  if (
    path.length === 0 ||
    path.some(
      (segment) =>
        !SAFE_PATH_SEGMENT.test(segment) || segment === "." || segment === "..",
    )
  ) {
    return NextResponse.json(
      { message: "مسار الطلب غير صالح" },
      { status: 400, headers: { "X-Request-Id": requestId } },
    );
  }

  if (INTERNAL_ONLY_ROOTS.has(path[0])) {
    return NextResponse.json(
      { message: "المسار غير متاح" },
      { status: 404, headers: { "X-Request-Id": requestId } },
    );
  }

  if (
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    !hasTrustedOrigin(request, environment.appOrigin, trustedOrigins(environment))
  ) {
    return NextResponse.json(
      { message: "طلب غير موثوق" },
      { status: 403, headers: { "X-Request-Id": requestId } },
    );
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const target = `${environment.apiBaseUrl}/${path.join("/")}${request.nextUrl.search}`;
  const isBodyless = BODYLESS_METHODS.has(method);
  const rawBody = isBodyless ? undefined : await request.arrayBuffer();
  const headers = new Headers({ "X-Request-Id": requestId });
  const clientIp = trustedClientIp(request.headers);
  if (clientIp) headers.set("X-Forwarded-For", clientIp);

  if (token) headers.set("Authorization", `Bearer ${token}`);
  const contentType = request.headers.get("content-type");
  if (contentType && rawBody?.byteLength) headers.set("Content-Type", contentType);
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  for (const name of ["accept", "if-none-match", "range", "if-range"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const backendResponse = await fetch(target, {
      method,
      headers,
      body: rawBody?.byteLength ? rawBody : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const responseHeaders = new Headers({ "X-Request-Id": requestId });
    for (const name of [
      "content-type",
      "content-length",
      "content-disposition",
      "cache-control",
      "etag",
      "last-modified",
      "accept-ranges",
      "content-range",
      "x-content-type-options",
    ]) {
      const value = backendResponse.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    const body =
      method === "HEAD" || backendResponse.status === 204 || backendResponse.status === 304
        ? null
        : await backendResponse.arrayBuffer();
    return new NextResponse(body, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { message: "الخدمة الخلفية غير متاحة حالياً" },
      { status: 503, headers: { "X-Request-Id": requestId } },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
