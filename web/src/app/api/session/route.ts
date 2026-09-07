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
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      credentials = await request.json();
    } else if (
      contentType.includes("application/x-www-form-urlencoded") &&
      environment.isProduction === false
    ) {
      // Progressive enhancement: the login form posts natively (no-JS path)
      // as urlencoded. Accepted only for non-JSON submits; the redirect
      // below carries NO credentials — only a generic error flag.
      const form = new URLSearchParams(await request.text());
      credentials = {
        email: form.get("email") ?? "",
        password: form.get("password") ?? "",
      };
    } else {
      return jsonResponse({ message: "بيانات الطلب غير صالحة" }, 400, requestId);
    }
  } catch {
    return jsonResponse({ message: "بيانات الطلب غير صالحة" }, 400, requestId);
  }
  const isFormSubmit = contentType.includes("application/x-www-form-urlencoded");
  const loginFailure = () =>
    isFormSubmit
      // 303 to a bare URL — the error flag never includes what the user typed
      ? new NextResponse(null, {
          status: 303,
          headers: { Location: "/?error=1", "X-Request-Id": requestId },
        })
      : jsonResponse({ message: "تعذر تسجيل الدخول. تحقق من البيانات وحاول مجدداً." }, 401, requestId);

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
      if (isFormSubmit) return loginFailure();
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

    // No-JS form submit: redirect to the dashboard. The redirect URL carries
    // no credentials — only the session cookie does.
    if (isFormSubmit) {
      return new NextResponse(null, {
        status: 303,
        headers: { Location: "/dashboard", "X-Request-Id": requestId },
      });
    }
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
