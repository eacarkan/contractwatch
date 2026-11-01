import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { CURRENT_PROMPT } from "@/lib/llm/prompts";
import { buildReviewPackage } from "@/lib/review/package";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    return NextResponse.json({ error: "contractNotFound" }, { status: 404 });
  }

  const obligations = await prisma.obligation.findMany({
    where: {
      contractId: id,
      reviewStatus: "PENDING",
      OR: [{ runId: null }, { run: { promptVersion: CURRENT_PROMPT.version } }],
    },
    orderBy: [{ clause: { orderIndex: "asc" } }, { createdAt: "asc" }],
    include: { clause: { select: { heading: true, body: true } } },
  });

  return new NextResponse(
    JSON.stringify(buildReviewPackage(contract, obligations), null, 2),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="contractwatch-review-package.json"`,
      },
    },
  );
}
