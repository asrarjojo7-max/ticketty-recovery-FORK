import { describe, expect, it } from "vitest";
import { navigation } from "../config/navigation";
import { filterNavigation, hasPermission } from "./permissions";

describe("permission helpers", () => {
  it("supports exact, domain wildcard, and global permissions", () => {
    expect(hasPermission(["bookings.read"], "bookings.read")).toBe(true);
    expect(hasPermission(["bookings.*"], "bookings.write")).toBe(true);
    expect(hasPermission(["*"], "settings.write")).toBe(true);
    expect(hasPermission(["bookings.read"], "settings.read")).toBe(false);
  });

  it("hides navigation entries the user cannot access", () => {
    const sections = filterNavigation(navigation, ["bookings.read.own"]);
    const links = sections.flatMap((section) =>
      section.items.map((item) => item.href),
    );

    expect(links).toContain("/bookings");
    expect(links).not.toContain("/settings");
    expect(links).not.toContain("/financial");
  });

  it("keeps all in-tenant navigation entries for an owner, but never the platform console", () => {
    const visible = filterNavigation(navigation, ["*"]);
    const links = visible.flatMap((section) =>
      section.items.map((item) => item.href),
    );

    const allInTenant = navigation
      .flatMap((section) => section.items)
      .filter((item) =>
        (item.permissions ?? []).every(
          (permission) => permission !== "platform.admin",
        ),
      );

    expect(links).toHaveLength(allInTenant.length);
    expect(links).not.toContain("/platform");
  });

  it("grants platform.admin only when explicitly held (never via tenant wildcard)", () => {
    expect(hasPermission(["*"], "platform.admin")).toBe(false);
    expect(hasPermission(["platform.*"], "platform.admin")).toBe(false);
    expect(hasPermission(["platform.admin"], "platform.admin")).toBe(true);
    // نطاقات الأعمال العادية تتبع النجمة كالعادة
    expect(hasPermission(["*"], "settings.write")).toBe(true);
  });
});
