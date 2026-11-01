import "server-only";

import { readBlob } from "@/lib/blob";
import { prisma } from "@/lib/db";
import type { DocKind } from "@/lib/generated/prisma/enums";
import {
  extractText,
  hasNoText,
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
  const markFailed = () =>
    prisma.document.update({
      where: { id: document.id },
      data: { textStatus: "FAILED" },
    });

  try {
    const extracted = await extractText(buffer, blob.extension);

    if (extracted.isScanned) {
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
        status: "NEEDS_OCR",
        clauses: 0,
        warnings: [],
        fallbackReasons: [],
      };
    }

    if (extracted.pages.every((page) => hasNoText(page.text))) {
      await markFailed();
      return { ok: false, code: "emptyText" };
    }

    const { clauses, fallbackReasons } = splitClauses(extracted.pages);

    await prisma.$transaction([
      prisma.clause.createMany({
        data: clauses.map((clause) => ({
          ...clause,
          documentId: document.id,
        })),
      }),
      prisma.document.update({
        where: { id: document.id },
        data: {
          textStatus: "EXTRACTED",
          isScanned: false,
          pageCount: extracted.pageCount,
        },
      }),
    ]);

    return {
      ok: true,
      status: "EXTRACTED",
      clauses: countNumberedClauses(clauses),
      warnings: extracted.warnings,
      fallbackReasons,
    };
  } catch (error) {
    console.error(`Could not process document ${document.id}`, error);
    await markFailed();
    return { ok: false, code: "extractionFailed" };
  }
}
