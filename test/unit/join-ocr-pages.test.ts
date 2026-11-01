import { describe, expect, it } from "vitest";

import { joinOcrPages } from "@/lib/ocr/join-pages";

describe("joinOcrPages", () => {
  it("marks each page break with a form feed", () => {
    expect(joinOcrPages(["one", "two"])).toBe("one\ftwo\f");
  });

  it("keeps a blank page, so later page numbers stay right", () => {
    expect(joinOcrPages(["one", "", "three"]).split("\f")).toEqual([
      "one",
      "",
      "three",
      "",
    ]);
  });

  it("removes form feeds Tesseract adds to its own output", () => {
    expect(joinOcrPages(["one\f", "two\f"])).toBe("one\ftwo\f");
  });
});
