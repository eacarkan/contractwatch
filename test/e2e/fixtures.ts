/**
 * Database steps for the smoke test. Playwright cannot load the generated Prisma
 * client, so the test runs this file through tsx.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const BODY =
  "Lorsque l’entrepreneur estime qu’un ordre appelle des réserves, il doit,\nsous peine de forclusion, les présenter dans un délai de quinze jours.";

async function seed() {
  const contract = await prisma.contract.create({
    data: { name: "Smoke test", type: "CCAG_TRAVAUX", language: "fr" },
  });
  const document = await prisma.document.create({
    data: {
      contractId: contract.id,
      kind: "GENERAL_CONDITIONS",
      filename: "smoke.txt",
      storagePath: "smoke",
      textStatus: "EXTRACTED",
    },
  });
  const clause = await prisma.clause.create({
    data: {
      documentId: document.id,
      clauseRef: "8.3",
      heading: "Réserves",
      body: BODY,
      pageFrom: 3,
      pageTo: 3,
      orderIndex: 1,
    },
  });
  // Created one at a time, so the queue order is certain.
  for (const title of ["Première", "Deuxième", "Troisième"]) {
    await prisma.obligation.create({
      data: {
        contractId: contract.id,
        clauseId: clause.id,
        clauseRef: "8.3",
        obligor: "CONTRACTOR",
        category: "NOTICE",
        title,
        description: "Présenter les réserves par écrit.",
        triggerType: "EVENT",
        periodValue: 15,
        periodBasis: "CALENDAR_DAYS",
        isTimeBar: true,
        sourceQuote: "sous peine de forclusion, les présenter dans un délai",
        confidence: 0.9,
      },
    });
  }
  return contract.id;
}

async function revisionStatuses(contractId: string) {
  const revisions = await prisma.obligationRevision.findMany({
    where: { obligation: { contractId } },
  });
  return revisions.map(
    (revision) => (revision.after as { reviewStatus: string }).reviewStatus,
  );
}

async function main() {
  const [step, contractId] = process.argv.slice(2);
  if (step === "seed") console.log(await seed());
  if (step === "revisions") {
    console.log(JSON.stringify(await revisionStatuses(contractId!)));
  }
  if (step === "remove") {
    await prisma.contract.delete({ where: { id: contractId! } });
  }
}

main().finally(() => prisma.$disconnect());
