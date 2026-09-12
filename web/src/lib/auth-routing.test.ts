import { describe, expect, it } from "vitest";
import { destinationAfterLogin } from "./auth-routing";

describe("destinationAfterLogin", () => {
  it("routes temporary-password users to mandatory remediation", () => {
    expect(destinationAfterLogin({ mustChangePassword: true })).toBe(
      "/change-password",
    );
  });

  it("routes compliant users to the dashboard", () => {
    expect(destinationAfterLogin({ mustChangePassword: false })).toBe(
      "/dashboard",
    );
  });
});
