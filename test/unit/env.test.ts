import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

const DATABASE_URL = "postgresql://contractwatch@localhost:54329/contractwatch";

describe("parseEnv", () => {
  it("accepts a local setup with only a database URL", () => {
    expect(parseEnv({ DATABASE_URL }).DATABASE_URL).toBe(DATABASE_URL);
  });

  it("names the missing variable and points to .env.example", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*\.env\.example/);
  });

  it("requires the Blob token on Vercel", () => {
    expect(() => parseEnv({ DATABASE_URL, VERCEL: "1" })).toThrow(
      /BLOB_READ_WRITE_TOKEN/,
    );
    expect(() =>
      parseEnv({ DATABASE_URL, VERCEL: "1", BLOB_READ_WRITE_TOKEN: "token" }),
    ).not.toThrow();
  });
});
