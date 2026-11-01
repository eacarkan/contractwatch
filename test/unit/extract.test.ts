import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { extractText } from "@/lib/text/extract";

import { makeTextPdf } from "../helpers/make-pdf";

const FULL_PAGE = [
  "Article 1 : Objet du cahier de démonstration",
  "Le titulaire notifie au maître d’œuvre tout événement sous 15 jours.",
];

describe("extractText: PDF", () => {
  it("returns text page by page with French characters intact", async () => {
    const pdf = makeTextPdf([
      FULL_PAGE,
      ["Article 2 : Délais d’exécution des travaux prévus"],
    ]);
    const result = await extractText(pdf, "pdf");

    expect(result.pageCount).toBe(2);
    expect(result.isScanned).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.pages.map((page) => page.page)).toEqual([1, 2]);
    expect(result.pages[0].text).toContain("maître d’œuvre");
    expect(result.pages[1].text).toContain("Délais d’exécution");
  });

  it("flags a PDF with no text layer as scanned", async () => {
    const result = await extractText(makeTextPdf([[], [], []]), "pdf");

    expect(result.isScanned).toBe(true);
    expect(result.pageCount).toBe(3);
  });

  it("warns about individual pages with no text in an otherwise digital PDF", async () => {
    const pdf = makeTextPdf([FULL_PAGE, [], FULL_PAGE, FULL_PAGE, FULL_PAGE]);
    const result = await extractText(pdf, "pdf");

    expect(result.isScanned).toBe(false);
    expect(result.warnings).toEqual([
      { code: "pages-without-text", pages: [2] },
    ]);
  });

  it("rejects a file that is not a PDF", async () => {
    await expect(
      extractText(Buffer.from("not a pdf"), "pdf"),
    ).rejects.toThrow();
  });
});

describe("extractText: DOCX", () => {
  it("keeps clause numbers typed into the text", async () => {
    const docx = readFileSync("test/fixtures/typed-numbers.docx");
    const result = await extractText(docx, "docx");

    expect(result.pageCount).toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.pages[0].text).toContain("Article 1 : Objet du marché");
    expect(result.pages[0].text).toContain("2.1 Notification");
  });

  it("warns when Word's automatic numbers are missing from the text", async () => {
    const docx = readFileSync("test/fixtures/auto-numbers.docx");
    const result = await extractText(docx, "docx");

    expect(result.pages[0].text).toContain("Le titulaire notifie");
    expect(result.pages[0].text).not.toMatch(/^1\./m);
    expect(result.warnings).toEqual([
      { code: "docx-auto-numbering", paragraphs: 3 },
    ]);
  });
});

describe("extractText: plain text", () => {
  it("treats form feeds as page breaks", async () => {
    const result = await extractText(
      Buffer.from("première page\fseconde page\f"),
      "txt",
    );

    expect(result.pageCount).toBe(2);
    expect(result.pages).toEqual([
      { page: 1, text: "première page" },
      { page: 2, text: "seconde page" },
    ]);
  });

  it("leaves page numbers empty when there are no form feeds", async () => {
    const result = await extractText(Buffer.from("une seule page"), "txt");

    expect(result.pageCount).toBeNull();
    expect(result.pages).toEqual([{ page: null, text: "une seule page" }]);
  });

  it("falls back to Windows-1252 for non-UTF-8 text", async () => {
    const result = await extractText(Buffer.from("délai", "latin1"), "txt");

    expect(result.pages[0].text).toBe("délai");
  });
});
