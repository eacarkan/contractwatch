import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { ingestOcrText } from "@/lib/ingest";

const bodySchema = z.object({ text: z.string().max(4 * 1024 * 1024) });

/** Receives the text the browser read from a document marked as needing OCR. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id: contractId, documentId } = await params;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
  }

  const document = await prisma.document.findFirst({
    where: { id: documentId, contractId, textStatus: "NEEDS_OCR" },
    select: { id: true },
  });
  if (!document) {
    return NextResponse.json({ error: "documentNotFound" }, { status: 404 });
  }

  const result = await ingestOcrText(document.id, body.data.text);
  return result.ok
    ? NextResponse.json(result, { status: 201 })
    : NextResponse.json({ error: result.code }, { status: 422 });
}
