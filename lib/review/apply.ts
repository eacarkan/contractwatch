import "server-only";

import { prisma } from "@/lib/db";
import type { ReviewStatus } from "@/lib/generated/prisma/enums";
import {
  editableFields,
  hasChanges,
  type ObligationEdit,
} from "@/lib/review/fields";

export type ReviewInput =
  | { decision: "CONFIRMED" | "REJECTED"; note?: string | null }
  | { decision: "EDITED"; edit: ObligationEdit; note?: string | null };

export type ReviewResult =
  | { ok: true; status: ReviewStatus }
  | { ok: false; error: "notFound" | "unknownClause" };

/** The decision and its revision row are written together or not at all. */
export async function applyReview(
  contractId: string,
  obligationId: string,
  input: ReviewInput,
): Promise<ReviewResult> {
  return prisma.$transaction(async (tx) => {
    const obligation = await tx.obligation.findFirst({
      where: { id: obligationId, contractId },
      include: { clause: { select: { documentId: true } } },
    });
    if (!obligation) return { ok: false, error: "notFound" };

    const before = editableFields(obligation);
    const edit = input.decision === "EDITED" ? input.edit : before;
    const edited = hasChanges(before, edit);
    const status: ReviewStatus =
      input.decision === "EDITED" && !edited ? "CONFIRMED" : input.decision;

    let clauseId = obligation.clauseId;
    if (edit.clauseRef !== obligation.clauseRef) {
      const clause = await tx.clause.findFirst({
        where: {
          clauseRef: edit.clauseRef,
          document: obligation.clause
            ? { id: obligation.clause.documentId }
            : { contractId },
        },
        select: { id: true },
      });
      if (!clause) return { ok: false, error: "unknownClause" };
      clauseId = clause.id;
    }

    await tx.obligation.update({
      where: { id: obligation.id },
      data: {
        ...edit,
        clauseId,
        reviewStatus: status,
        reviewedAt: new Date(),
      },
    });
    await tx.obligationRevision.create({
      data: {
        obligationId: obligation.id,
        before: { ...before, reviewStatus: obligation.reviewStatus },
        after: { ...edit, reviewStatus: status },
        note: input.note || null,
      },
    });

    return { ok: true, status };
  });
}
