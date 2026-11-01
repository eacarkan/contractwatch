import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { DocKind } from "@/lib/generated/prisma/enums";
import { ingestDocument } from "@/lib/ingest";
import { parseBlobPath } from "@/lib/upload-rules";

const bodySchema = z.object({
  pathname: z.string(),
  filename: z.string().trim().min(1).max(255),
  kind: z.enum(DocKind),
  forceOcr: z.boolean().optional(),
});

const STATUS_BY_CODE = {
  blobNotFound: 404,
  emptyText: 422,
  extractionFailed: 422,
} as const;

/** Receives the path of a file the browser has already written to storage. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: contractId } = await params;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const blob = body.success ? parseBlobPath(body.data.pathname) : null;
  if (!body.success || !blob || blob.contractId !== contractId) {
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true },
  });
  if (!contract) {
    return NextResponse.json({ error: "contractNotFound" }, { status: 404 });
  }

  const result = await ingestDocument({ contractId, ...body.data });
  return result.ok
    ? NextResponse.json(result, { status: 201 })
    : NextResponse.json(
        { error: result.code },
        { status: STATUS_BY_CODE[result.code] },
      );
}
