/**
 * Replaces the demonstration contracts with the files in data/seed, then adds a
 * short story of events and letters dated from today, so the calendar always has
 * something due. Other contracts are left alone. Runs on every deployment, which
 * also clears whatever visitors did to the demonstration contracts.
 *
 *   pnpm db:seed
 */
import { existsSync, readFileSync } from "node:fs";

import { linkLetter } from "@/lib/correspondence/service";
import { addDays, canGenerateDeadlines, todayUtc } from "@/lib/deadline";
import { syncEventDeadlines } from "@/lib/deadlines/service";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

const FILES = ["data/seed/specimen-epc.json", "data/seed/ccag.json"];

type Story = {
  events: {
    name: string;
    eventType: string;
    daysAgo: number;
    clauseRefs: string[];
  }[];
  letter?: { subject: string; daysAgo: number; clauseRef: string };
};

const STORIES: Record<string, Story> = {
  EPC_GENERIC: {
    events: [
      {
        name: "Commencement Date",
        eventType: "COMMENCEMENT",
        daysAgo: 20,
        clauseRefs: ["4.1", "4.3", "5.1", "8.1", "8.2", "15.1", "6.1", "8.3"],
      },
      {
        name: "Variation request received",
        eventType: "INSTRUCTION",
        daysAgo: 9,
        clauseRefs: ["12.1", "12.2"],
      },
      {
        name: "Late delivery of Employer-supplied plant",
        eventType: "DELAY_EVENT",
        daysAgo: 3,
        clauseRefs: ["8.5", "17.1", "17.2"],
      },
    ],
    letter: {
      subject: "Detailed programme for review",
      daysAgo: 4,
      clauseRef: "8.2",
    },
  },
  CCAG_TRAVAUX: {
    events: [
      {
        name: "Ordre de service de commencer les travaux",
        eventType: "COMMENCEMENT",
        daysAgo: 12,
        clauseRefs: ["5.1", "6.1"],
      },
    ],
  },
};

async function tellStory(contractId: string, type: string) {
  const story = STORIES[type];
  if (!story) return;
  const today = todayUtc();

  const usable = (
    await prisma.obligation.findMany({
      where: { contractId, reviewStatus: { in: ["CONFIRMED", "EDITED"] } },
    })
  ).filter(canGenerateDeadlines);

  for (const { clauseRefs, daysAgo, ...data } of story.events) {
    const ids = usable
      .filter((row) => clauseRefs.includes(row.clauseRef))
      .map((row) => row.id);
    if (ids.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: { ...data, contractId, occurredOn: addDays(today, -daysAgo) },
      });
      await syncEventDeadlines(tx, contractId, event, ids);
    });
  }

  if (!story.letter) return;
  const obligation = usable.find(
    (row) => row.clauseRef === story.letter!.clauseRef,
  );
  const deadline =
    obligation &&
    (await prisma.deadline.findFirst({
      where: { obligationId: obligation.id },
      orderBy: { dueOn: "asc" },
    }));
  if (!obligation || !deadline) return;

  const letter = await prisma.correspondence.create({
    data: {
      contractId,
      direction: "OUT",
      sentOn: addDays(today, -story.letter.daysAgo),
      referenceNo: "OUT-0001",
      fromParty: obligation.obligor,
      toParty: "ENGINEER",
      subject: story.letter.subject,
    },
  });
  await linkLetter(contractId, letter.id, {
    obligationId: obligation.id,
    deadlineId: deadline.id,
    relation: "SATISFIES",
  });
}

type Json = Record<string, never> & {
  id: string;
  type: string;
  holidays: Prisma.HolidayCreateManyInput[];
  documents: (Prisma.DocumentCreateManyInput & {
    clauses: Prisma.ClauseCreateManyInput[];
    runs: Prisma.ExtractionRunCreateManyInput[];
  })[];
  obligations: (Prisma.ObligationCreateManyInput & {
    revisions: Prisma.ObligationRevisionCreateManyInput[];
  })[];
};

async function loadSnapshot(path: string) {
  const { holidays, documents, obligations, ...contract } = JSON.parse(
    readFileSync(path, "utf8"),
  ) as Json;

  await prisma.contract.deleteMany({ where: { id: contract.id } });
  await prisma.contract.create({
    data: contract as unknown as Prisma.ContractCreateInput,
  });
  await prisma.holiday.createMany({ data: holidays });

  for (const { clauses, runs, ...document } of documents) {
    await prisma.document.create({ data: document });
    await prisma.clause.createMany({ data: clauses });
    await prisma.extractionRun.createMany({ data: runs });
  }
  for (const { revisions, ...obligation } of obligations) {
    await prisma.obligation.create({ data: obligation });
    await prisma.obligationRevision.createMany({
      data: revisions as Prisma.ObligationRevisionCreateManyInput[],
    });
  }

  await tellStory(contract.id, contract.type);
  console.log(`${path}: ${obligations.length} obligations`);
}

async function main() {
  for (const path of FILES) {
    if (existsSync(path)) await loadSnapshot(path);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
