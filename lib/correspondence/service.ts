import "server-only";

import { isMetBy } from "@/lib/deadline";
import { prisma } from "@/lib/db";
import type { CorrRelation, PartyRole } from "@/lib/generated/prisma/enums";

export type LinkInput = {
  obligationId: string;
  deadlineId: string | null;
  relation: CorrRelation;
};

export type LinkResult =
  { ok: true; met: boolean } | { ok: false; error: "notFound" | "wrongSender" };

/** Whether this sender is the party the obligation binds. */
export function senderMatches(fromParty: PartyRole, obligor: PartyRole) {
  return obligor === "EITHER" || obligor === "OTHER" || obligor === fromParty;
}

/** The link and the deadline's new status are written together or not at all. */
export async function linkLetter(
  contractId: string,
  correspondenceId: string,
  input: LinkInput,
): Promise<LinkResult> {
  return prisma.$transaction(async (tx) => {
    const [letter, obligation, deadline] = await Promise.all([
      tx.correspondence.findFirst({
        where: { id: correspondenceId, contractId },
      }),
      tx.obligation.findFirst({
        where: { id: input.obligationId, contractId },
      }),
      input.deadlineId
        ? tx.deadline.findFirst({
            where: { id: input.deadlineId, obligationId: input.obligationId },
          })
        : null,
    ]);
    if (!letter || !obligation || (input.deadlineId && !deadline)) {
      return { ok: false, error: "notFound" };
    }
    if (
      input.relation === "SATISFIES" &&
      !senderMatches(letter.fromParty, obligation.obligor)
    ) {
      return { ok: false, error: "wrongSender" };
    }

    await tx.correspondenceObligation.upsert({
      where: {
        correspondenceId_obligationId: {
          correspondenceId,
          obligationId: input.obligationId,
        },
      },
      create: { correspondenceId, ...input },
      update: { deadlineId: input.deadlineId, relation: input.relation },
    });

    const met =
      input.relation === "SATISFIES" &&
      deadline !== null &&
      isMetBy(letter, deadline.dueOn);
    if (met) {
      await tx.deadline.update({
        where: { id: deadline.id },
        data: { status: "MET", metById: correspondenceId },
      });
    }
    return { ok: true, met };
  });
}

/** A deadline this letter had met goes back to open. */
export async function unlinkLetter(
  contractId: string,
  correspondenceId: string,
  obligationId: string,
) {
  await prisma.$transaction(async (tx) => {
    const letter = await tx.correspondence.findFirst({
      where: { id: correspondenceId, contractId },
      select: { id: true },
    });
    if (!letter) return;

    await tx.deadline.updateMany({
      where: { obligationId, metById: correspondenceId },
      data: { status: "OPEN", metById: null },
    });
    await tx.correspondenceObligation.deleteMany({
      where: { correspondenceId, obligationId },
    });
  });
}

export async function deleteLetter(
  contractId: string,
  correspondenceId: string,
) {
  await prisma.$transaction(async (tx) => {
    const letter = await tx.correspondence.findFirst({
      where: { id: correspondenceId, contractId },
      select: { id: true },
    });
    if (!letter) return;

    await tx.deadline.updateMany({
      where: { metById: correspondenceId },
      data: { status: "OPEN", metById: null },
    });
    await tx.correspondence.delete({ where: { id: correspondenceId } });
  });
}
