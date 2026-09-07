import {
  getServerEnvironment,
  trustedOrigins,
} from "@/lib/server/env";
import {
  hasTrustedOrigin,
  requestIdFrom,
} from "@/lib/server/request-security";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "ticketty_session";
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/;

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

  if (token) headers.set("Authorization", `Bearer ${token}`);
  const contentType = request.headers.get("content-type");
  if (contentType && rawBody?.byteLength) headers.set("Content-Type", contentType);
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  try {
    const backendResponse = await fetch(target, {
      method,
      headers,
      body: rawBody?.byteLength ? rawBody : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const responseHeaders = new Headers({ "X-Request-Id": requestId });
    const backendContentType = backendResponse.headers.get("content-type");
    if (backendContentType) {
      responseHeaders.set("Content-Type", backendContentType);
    }

    const body =
      method === "HEAD" || backendResponse.status === 204
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
