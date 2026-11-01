import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getModelConfig, runNextBatch } from "@/lib/llm/extract";

const bodySchema = z.object({ retryFailed: z.boolean().optional() });

/**
 * Runs one batch of clauses and says what happened; the caller repeats until
 * NOTHING_LEFT. Refuses when no model service is set, as on the public site.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> },
) {
  const { id: contractId, documentId } = await params;

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "invalidRequest" }, { status: 400 });
  }

  const config = getModelConfig();
  if (!config) {
    return NextResponse.json({ error: "modelNotConfigured" }, { status: 503 });
  }

  const document = await prisma.document.findFirst({
    where: { id: documentId, contractId, textStatus: "EXTRACTED" },
    select: { id: true },
  });
  if (!document) {
    return NextResponse.json({ error: "documentNotFound" }, { status: 404 });
  }

  const result = await runNextBatch(document.id, {
    config,
    retryFailed: body.data.retryFailed,
  });
  return NextResponse.json(result, {
    status: result.status === "UNAVAILABLE" ? 502 : 200,
  });
}
