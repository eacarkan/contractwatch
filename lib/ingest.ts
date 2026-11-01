import "server-only";

import { readBlob } from "@/lib/blob";
import { prisma } from "@/lib/db";
import type { DocKind } from "@/lib/generated/prisma/enums";
import {
  extractText,
  hasNoText,
  type ExtractedText,
  type ExtractionWarning,
} from "@/lib/text/extract";
import {
  countNumberedClauses,
  splitClauses,
  type FallbackReason,
} from "@/lib/text/split-clauses";
import { parseBlobPath } from "@/lib/upload-rules";

export type IngestResult =
  | {
      ok: true;
      documentId: string;
      status: "EXTRACTED" | "NEEDS_OCR";
      clauses: number;
      warnings: ExtractionWarning[];
      fallbackReasons: FallbackReason[];
    }
  | { ok: false; code: "blobNotFound" | "emptyText" | "extractionFailed" };

/** Runs after the browser has written the file to storage. */
export async function ingestDocument(input: {
  contractId: string;
  pathname: string;
  filename: string;
  kind: DocKind;
  /** For a PDF whose text layer is unreliable, such as a scanner's own poor one. */
  forceOcr?: boolean;
}): Promise<IngestResult> {
  const blob = parseBlobPath(input.pathname);
  const buffer = blob && (await readBlob(input.pathname));
  if (!blob || !buffer) return { ok: false, code: "blobNotFound" };

  const document = await prisma.document.create({
    data: {
      contractId: input.contractId,
      kind: input.kind,
      filename: input.filename,
      storagePath: input.pathname,
    },
  });

  try {
    const extracted = await extractText(buffer, blob.extension);

    if (extracted.isScanned || (input.forceOcr && blob.extension === "pdf")) {
      await prisma.document.update({
        where: { id: document.id },
        data: {
          textStatus: "NEEDS_OCR",
          isScanned: true,
          pageCount: extracted.pageCount,
        },
      });
      return {
        ok: true,
        documentId: document.id,
        status: "NEEDS_OCR",
        clauses: 0,
        warnings: [],
        fallbackReasons: [],
      };
    }

    return await saveClauses(document.id, extracted, false);
  } catch (error) {
    console.error(`Could not process document ${document.id}`, error);
    await markFailed(document.id);
    return { ok: false, code: "extractionFailed" };
  }
}

/**
 * Receives the text the browser read from a scanned PDF. Form feeds mark page
 * breaks, as in any plain text source.
 */
export async function ingestOcrText(
  documentId: string,
  text: string,
): Promise<IngestResult> {
  const extracted = await extractText(Buffer.from(text, "utf8"), "txt");
  try {
    return await saveClauses(documentId, extracted, true);
  } catch (error) {
    console.error(`Could not save OCR text for ${documentId}`, error);
    await markFailed(documentId);
    return { ok: false, code: "extractionFailed" };
  }
}

function markFailed(documentId: string) {
  return prisma.document.update({
    where: { id: documentId },
    data: { textStatus: "FAILED" },
  });
}

async function saveClauses(
  documentId: string,
  extracted: ExtractedText,
  isScanned: boolean,
): Promise<IngestResult> {
  if (extracted.pages.every((page) => hasNoText(page.text))) {
    await markFailed(documentId);
    return { ok: false, code: "emptyText" };
  }

  const { clauses, fallbackReasons } = splitClauses(extracted.pages);

  await prisma.$transaction([
    prisma.clause.createMany({
      data: clauses.map((clause) => ({ ...clause, documentId })),
    }),
    prisma.document.update({
      where: { id: documentId },
      data: {
        textStatus: "EXTRACTED",
        isScanned,
        pageCount: extracted.pageCount,
      },
    }),
  ]);

  return {
    ok: true,
    documentId,
    status: "EXTRACTED",
    clauses: countNumberedClauses(clauses),
    warnings: extracted.warnings,
    fallbackReasons,
  };
}
