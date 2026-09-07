import { getServerEnvironment, trustedOrigins } from "@/lib/server/env";
import {
  hasTrustedOrigin,
  jwtRemainingSeconds,
  requestIdFrom,
} from "@/lib/server/request-security";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "ticketty_session";

interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    name: string;
    email: string;
    roleKey: string;
    orgId: string | null;
    branchId: string | null;
    permissions: string[];
  };
}

function jsonResponse(body: unknown, status: number, requestId: string) {
  return NextResponse.json(body, {
    status,
    headers: { "X-Request-Id": requestId },
  });
}

export async function POST(request: Request) {
  const requestId = requestIdFrom(request.headers);
  const environment = getServerEnvironment();
  if (!hasTrustedOrigin(request, environment.appOrigin, trustedOrigins(environment))) {
    return jsonResponse({ message: "طلب غير موثوق" }, 403, requestId);
  }

  let credentials: unknown;
  try {
    credentials = await request.json();
  } catch {
    return jsonResponse({ message: "بيانات الطلب غير صالحة" }, 400, requestId);
  }

  try {
    const response = await fetch(`${environment.apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify(credentials),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data: unknown = await response.json();

    if (!response.ok) {
      const message =
        typeof data === "object" &&
        data !== null &&
        "message" in data &&
        typeof data.message === "string"
          ? data.message
          : "تعذر تسجيل الدخول. تحقق من البيانات وحاول مجدداً.";
      return jsonResponse({ message }, response.status, requestId);
    }

    const login = data as LoginResponse;
    const maxAge = login.access_token
      ? jwtRemainingSeconds(login.access_token)
      : null;
    if (!login.user || !maxAge) {
      throw new Error("Malformed authentication response");
    }

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, login.access_token, {
      httpOnly: true,
      secure: environment.cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge,
      priority: "high",
    });

    return jsonResponse({ user: login.user }, 200, requestId);
  } catch {
    return jsonResponse(
      { message: "خدمة الدخول غير متاحة حالياً. حاول مرة أخرى بعد قليل." },
      503,
      requestId,
    );
  }
}

export async function DELETE(request: Request) {
  const requestId = requestIdFrom(request.headers);
  const environment = getServerEnvironment();
  if (!hasTrustedOrigin(request, environment.appOrigin, trustedOrigins(environment))) {
    return jsonResponse({ message: "طلب غير موثوق" }, 403, requestId);
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return jsonResponse({ success: true }, 200, requestId);
}
