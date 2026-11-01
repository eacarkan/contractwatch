import "pdf-parse/worker";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import type { UploadExtension } from "@/lib/upload-rules";

export type ExtractedPage = { page: number | null; text: string };

export type ExtractionWarning =
  | { code: "pages-without-text"; pages: number[] }
  | { code: "docx-auto-numbering"; paragraphs: number };

export type ExtractedText = {
  pages: ExtractedPage[];
  pageCount: number | null;
  isScanned: boolean;
  warnings: ExtractionWarning[];
};

// mammoth's published types omit `transforms`, which it documents and provides.
type MammothParagraph = { numbering?: { isOrdered?: boolean } | null };
const { transforms } = mammoth as unknown as {
  transforms: {
    paragraph: (
      transform: (paragraph: MammothParagraph) => MammothParagraph,
    ) => (element: unknown) => unknown;
  };
};

/** A page with less text than this has no real text layer. */
const MIN_PAGE_CHARACTERS = 30;
/** A PDF is treated as scanned when this share of its pages has no text layer. */
const SCANNED_PAGE_SHARE = 0.8;

export function hasNoText(text: string): boolean {
  return text.replace(/\s/g, "").length === 0;
}

async function extractPdf(buffer: Buffer): Promise<ExtractedText> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const pages = result.pages.map((page) => ({
      page: page.num,
      text: page.text,
    }));
    const pagesWithoutText = pages
      .filter(
        (page) => page.text.replace(/\s/g, "").length < MIN_PAGE_CHARACTERS,
      )
      .map((page) => page.page);
    const isScanned =
      pagesWithoutText.length >= pages.length * SCANNED_PAGE_SHARE;

    return {
      pages,
      pageCount: result.total,
      isScanned,
      warnings:
        !isScanned && pagesWithoutText.length > 0
          ? [{ code: "pages-without-text", pages: pagesWithoutText }]
          : [],
    };
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractedText> {
  const { value } = await mammoth.extractRawText({ buffer });

  // Word's automatic numbers are not in the raw text, so count the paragraphs
  // that use them and warn: their clause references would otherwise be lost.
  let numberedParagraphs = 0;
  await mammoth.convertToHtml(
    { buffer },
    {
      transformDocument: transforms.paragraph((paragraph) => {
        if (paragraph.numbering?.isOrdered) numberedParagraphs += 1;
        return paragraph;
      }),
    },
  );

  return {
    pages: [{ page: null, text: value }],
    pageCount: null,
    isScanned: false,
    warnings:
      numberedParagraphs > 0
        ? [{ code: "docx-auto-numbering", paragraphs: numberedParagraphs }]
        : [],
  };
}

function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Plain text keeps page numbers through form feeds, as scripts/ocr.py and scripts/anonymise.ts write them. */
function extractPlainText(buffer: Buffer): ExtractedText {
  const parts = decodeText(buffer)
    .replace(/\f\s*$/, "")
    .split("\f");
  const paged = parts.length > 1;
  return {
    pages: parts.map((text, index) => ({
      page: paged ? index + 1 : null,
      text,
    })),
    pageCount: paged ? parts.length : null,
    isScanned: false,
    warnings: [],
  };
}

export async function extractText(
  buffer: Buffer,
  extension: UploadExtension,
): Promise<ExtractedText> {
  switch (extension) {
    case "pdf":
      return extractPdf(buffer);
    case "docx":
      return extractDocx(buffer);
    case "txt":
      return extractPlainText(buffer);
  }
}
