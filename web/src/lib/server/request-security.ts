import { randomUUID } from "node:crypto";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdFrom(headers: Headers): string {
  const candidate = headers.get("x-request-id");
  return candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}

export function hasTrustedOrigin(
  request: Request,
  appOrigin: string,
  extraOrigins: readonly string[] = [],
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === appOrigin || extraOrigins.includes(origin);
}

export function jwtRemainingSeconds(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): number | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const payload = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    ) as { exp?: unknown };
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      return null;
    }
    const remaining = Math.floor(payload.exp - nowSeconds);
    return remaining > 0 ? remaining : null;
  } catch {
    return null;
  }
}
