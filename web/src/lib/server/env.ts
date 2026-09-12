import { z } from "zod";

export interface ServerEnvironment {
  apiBaseUrl: string;
  appOrigin: string;
  isProduction: boolean;
  cookieSecure: boolean;
}

function normalizedUrl(value: string, name: string, originOnly: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} must be an absolute HTTP(S) URL without credentials`);
  }
  if (url.search || url.hash || (originOnly && url.pathname !== '/')) {
    throw new Error(`${name} must not contain query, hash, or an unexpected path`);
  }

  return originOnly ? url.origin : url.toString().replace(/\/$/, "");
}

export function parseServerEnvironment(
  source: NodeJS.ProcessEnv,
): ServerEnvironment {
  const nodeEnv = z
    .enum(["development", "test", "production"])
    .catch("development")
    .parse(source.NODE_ENV);
  const production = nodeEnv === "production";
  const apiBaseUrl = source.API_BASE_URL ??
    (production ? undefined : "http://127.0.0.1:3001/api");
  const appOrigin = source.APP_ORIGIN ??
    (production ? undefined : "http://localhost:3000");

  if (!apiBaseUrl) throw new Error("API_BASE_URL is required in production");
  if (!appOrigin) throw new Error("APP_ORIGIN is required in production");

  const normalizedOrigin = normalizedUrl(appOrigin, "APP_ORIGIN", true);
  const originUrl = new URL(normalizedOrigin);
  if (
    production &&
    originUrl.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(originUrl.hostname)
  ) {
    throw new Error("APP_ORIGIN must use HTTPS in production");
  }

  return {
    apiBaseUrl: normalizedUrl(apiBaseUrl, "API_BASE_URL", false),
    appOrigin: normalizedOrigin,
    isProduction: production,
    // The session cookie must carry `secure` whenever the app is served
    // over HTTPS (e.g. behind a Cloudflare tunnel), even in dev mode.
    cookieSecure: originUrl.protocol === "https:",
  };
}

export function getServerEnvironment(): ServerEnvironment {
  return parseServerEnvironment(process.env);
}

/** True when the browser-facing origin differs from APP_ORIGIN (e.g. the
 *  dev server is reached through a tunnel like app.suda-technologies.com).
 *  `hasTrustedOrigin` then accepts both, keeping CSRF protection for
 *  unknown sites. Configure via APP_ORIGIN_ALT (comma-separated origins). */
export function trustedOrigins(environment: ServerEnvironment): string[] {
  const alt = process.env.APP_ORIGIN_ALT ?? "";
  return [
    environment.appOrigin,
    ...alt
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  ];
}
