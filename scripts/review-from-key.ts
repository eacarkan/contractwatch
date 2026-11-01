/**
 * Reviews a synthetic contract's pending obligations against its answer key.
 *
 *   pnpm review:key <contractId> <gold.json>
 */
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/db";
import { goldSetSchema } from "@/lib/llm/eval";
import { decideFromKey } from "@/lib/review/answer-key";
import { importReviewFile } from "@/lib/review/import";
import { reviewFileSchema } from "@/lib/review/package";

async function main() {
  const [contractId, goldPath] = process.argv.slice(2);
  if (!contractId || !goldPath) {
    console.error("Usage: pnpm review:key <contractId> <gold.json>");
    process.exitCode = 1;
    return;
  }

  const gold = goldSetSchema.parse(JSON.parse(readFileSync(goldPath, "utf8")));
  const pending = await prisma.obligation.findMany({
    where: { contractId, reviewStatus: "PENDING" },
    orderBy: [{ clause: { orderIndex: "asc" } }, { createdAt: "asc" }],
  });

  const file = reviewFileSchema.parse({
    reviewer: "Specimen answer key",
    decisions: decideFromKey(pending, gold.obligations),
  });
  console.log(await importReviewFile(contractId, file));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
