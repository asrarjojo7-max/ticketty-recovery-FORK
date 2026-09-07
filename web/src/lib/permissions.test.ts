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

  it("keeps all navigation entries for an owner", () => {
    const visible = filterNavigation(navigation, ["*"]);
    expect(visible.flatMap((section) => section.items)).toHaveLength(
      navigation.flatMap((section) => section.items).length,
    );
  });
});
