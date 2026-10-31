import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

type Messages = Record<string, unknown>;

function keyPaths(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === "object"
      ? keyPaths(value as Messages, path)
      : [path];
  });
}

describe("message files", () => {
  it("have the same keys in English and French", () => {
    expect(keyPaths(fr).sort()).toEqual(keyPaths(en).sort());
  });

  it("carry the required demo banner wording", () => {
    expect(en.Demo.banner).toBe("Demonstration data — not a live contract.");
    expect(fr.Demo.banner.length).toBeGreaterThan(0);
  });
});

describe("demo banner", () => {
  // These three files render every screen in the app between them.
  it.each([
    "app/[locale]/layout.tsx",
    "app/not-found.tsx",
    "app/global-error.tsx",
  ])("is rendered by %s", (file) => {
    expect(readFileSync(file, "utf8")).toContain("<DemoBanner");
  });
});
