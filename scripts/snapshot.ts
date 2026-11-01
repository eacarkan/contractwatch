/**
 * Copies a local contract's results into a file the seed loads, which is how
 * extraction done on this computer reaches the site. Only for public or synthetic
 * sources: the file is committed. Events and letters are left out, because the
 * seed writes them relative to the day it runs.
 *
 *   pnpm snapshot <contractId> <name>
 */
import { writeFileSync } from "node:fs";

import { prisma } from "@/lib/db";

async function main() {
  const [contractId, name] = process.argv.slice(2);
  if (!contractId || !name) {
    console.error("Usage: pnpm snapshot <contractId> <name>");
    process.exitCode = 1;
    return;
  }

  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: {
      holidays: true,
      documents: {
        include: {
          clauses: { orderBy: { orderIndex: "asc" } },
          runs: {
            where: { status: "DONE" },
            omit: { rawOutput: true },
          },
        },
      },
      obligations: {
        include: { revisions: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const path = `data/seed/${name}.json`;
  writeFileSync(path, `${JSON.stringify(contract, null, 1)}\n`);
  console.log(
    `${path}: ${contract.obligations.length} obligations from ${contract.documents.length} document(s)`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
