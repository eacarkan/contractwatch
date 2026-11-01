/**
 * Loads the synthetic specimen contract into the local database, ready for
 * `pnpm extract`.
 *
 *   pnpm specimen:load
 */
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/db";
import { extractText } from "@/lib/text/extract";
import { splitClauses } from "@/lib/text/split-clauses";

const FILE = "data/specimen-epc-contract.txt";

async function main() {
  const extracted = await extractText(readFileSync(FILE), "txt");
  const { clauses } = splitClauses(extracted.pages);

  const contract = await prisma.contract.create({
    data: {
      name: "Specimen EPC contract",
      type: "EPC_GENERIC",
      language: "en",
      timeForCompletionDays: 540,
    },
  });
  const document = await prisma.document.create({
    data: {
      contractId: contract.id,
      kind: "GENERAL_CONDITIONS",
      filename: "specimen-epc-contract.txt",
      storagePath: "seed/specimen-epc-contract.txt",
      language: "en",
      textStatus: "EXTRACTED",
      isScanned: false,
      pageCount: extracted.pageCount,
      clauses: { create: clauses },
    },
  });
  console.log(`Contract ${contract.id}`);
  console.log(`Document ${document.id}, ${clauses.length} clauses`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
