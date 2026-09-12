import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "./env";

describe("parseServerEnvironment", () => {
  it("uses safe local defaults outside production", () => {
    expect(parseServerEnvironment({ NODE_ENV: "test" })).toEqual({
      apiBaseUrl: "http://127.0.0.1:3001/api",
      appOrigin: "http://localhost:3000",
      isProduction: false,
      cookieSecure: false,
    });
  });

  it("marks the session cookie secure for HTTPS origins", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "test",
        APP_ORIGIN: "https://app.suda-technologies.com",
      }).cookieSecure,
    ).toBe(true);
    expect(
      parseServerEnvironment({
        NODE_ENV: "test",
        APP_ORIGIN: "http://localhost:3000",
      }).cookieSecure,
    ).toBe(false);
  });

  it("requires explicit production URLs", () => {
    expect(() => parseServerEnvironment({ NODE_ENV: "production" })).toThrow(
      "API_BASE_URL",
    );
  });

  it("rejects credentials and non-origin application URLs", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        API_BASE_URL: "https://user:pass@api.example.com/api",
        APP_ORIGIN: "https://app.example.com",
      }),
    ).toThrow("API_BASE_URL");
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        API_BASE_URL: "https://api.example.com/api",
        APP_ORIGIN: "https://app.example.com/path",
      }),
    ).toThrow("APP_ORIGIN");
  });

  it("requires HTTPS for a non-loopback production origin", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        API_BASE_URL: "http://backend:3001/api",
        APP_ORIGIN: "http://app.example.com",
      }),
    ).toThrow("HTTPS");
    expect(
      parseServerEnvironment({
        NODE_ENV: "production",
        API_BASE_URL: "http://backend:3001/api",
        APP_ORIGIN: "http://127.0.0.1:3000",
      }).cookieSecure,
    ).toBe(false);
  });
});
