import "server-only";

import {
  addDays,
  computeDeadlines,
  isoDate,
  planRecompute,
  type Calendar,
} from "@/lib/deadline";
import type { Prisma } from "@/lib/generated/prisma/client";

type Tx = Prisma.TransactionClient;

type ContractDates = {
  type: string;
  commencementDate: Date | null;
  timeForCompletionDays: number | null;
};

/** CCAG-Travaux art. 38.3 extends a period ending on a non-working day. Others stay silent. */
export function contractCalendar(
  contract: { type: string },
  holidays: { date: Date }[],
): Calendar {
  return {
    holidays: new Set(holidays.map(({ date }) => isoDate(date))),
    rollForward: contract.type === "CCAG_TRAVAUX",
  };
}

function endOfWorks(contract: ContractDates, eventDate: Date) {
  if (contract.timeForCompletionDays === null) return null;
  return addDays(
    contract.commencementDate ?? eventDate,
    contract.timeForCompletionDays,
  );
}

async function syncPair(
  tx: Tx,
  contract: ContractDates,
  calendar: Calendar,
  obligationId: string,
  event: { id: string; occurredOn: Date },
) {
  const obligation = await tx.obligation.findUniqueOrThrow({
    where: { id: obligationId },
  });
  const existing = await tx.deadline.findMany({
    where: { obligationId, eventId: event.id },
    orderBy: { dueOn: "asc" },
    include: { metBy: { select: { sentOn: true } } },
  });

  const changes = planRecompute(
    existing.map((row) => ({
      id: row.id,
      status: row.status,
      metById: row.metById,
      metOn: row.metBy?.sentOn ?? null,
    })),
    computeDeadlines(
      obligation,
      event.occurredOn,
      calendar,
      endOfWorks(contract, event.occurredOn),
    ),
  );

  for (const { id, ...data } of changes.update) {
    await tx.deadline.update({ where: { id }, data });
  }
  if (changes.remove.length > 0) {
    await tx.deadline.deleteMany({ where: { id: { in: changes.remove } } });
  }
  if (changes.create.length > 0) {
    await tx.deadline.createMany({
      data: changes.create.map((row) => ({
        ...row,
        obligationId,
        eventId: event.id,
      })),
    });
  }
}

async function loadContract(tx: Tx, contractId: string) {
  const contract = await tx.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { holidays: { select: { date: true } } },
  });
  return { contract, calendar: contractCalendar(contract, contract.holidays) };
}

/** Makes this event's deadlines match the obligations it now triggers. */
export async function syncEventDeadlines(
  tx: Tx,
  contractId: string,
  event: { id: string; occurredOn: Date },
  obligationIds: string[],
) {
  const { contract, calendar } = await loadContract(tx, contractId);

  await tx.deadline.deleteMany({
    where: { eventId: event.id, obligationId: { notIn: obligationIds } },
  });
  for (const obligationId of obligationIds) {
    await syncPair(tx, contract, calendar, obligationId, event);
  }
}

/** After a change to an obligation's period, every event it hangs from is worked out again. */
export async function recomputeObligation(tx: Tx, obligationId: string) {
  const obligation = await tx.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    select: {
      contractId: true,
      deadlines: {
        select: { event: { select: { id: true, occurredOn: true } } },
        distinct: ["eventId"],
      },
    },
  });
  if (obligation.deadlines.length === 0) return;

  const { contract, calendar } = await loadContract(tx, obligation.contractId);
  for (const { event } of obligation.deadlines) {
    if (event) await syncPair(tx, contract, calendar, obligationId, event);
  }
}

/** After a change to the contract's dates or holidays, everything is worked out again. */
export async function recomputeContract(tx: Tx, contractId: string) {
  const { contract, calendar } = await loadContract(tx, contractId);
  const pairs = await tx.deadline.findMany({
    where: { obligation: { contractId }, eventId: { not: null } },
    select: {
      obligationId: true,
      event: { select: { id: true, occurredOn: true } },
    },
    distinct: ["obligationId", "eventId"],
  });
  for (const { obligationId, event } of pairs) {
    if (event) await syncPair(tx, contract, calendar, obligationId, event);
  }
}
