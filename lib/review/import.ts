import "server-only";

import { prisma } from "@/lib/db";
import { applyReview } from "@/lib/review/apply";
import { editableFields, obligationEditSchema } from "@/lib/review/fields";
import type { ReviewFile } from "@/lib/review/package";

export type ImportSummary = {
  confirmed: number;
  edited: number;
  rejected: number;
  skipped: number;
};

/**
 * Applies each decision through the same path as the review screen, so each one
 * has its revision row. Items already decided, unknown ids and edits that do not
 * validate are counted as skipped and stay as they were.
 */
export async function importReviewFile(
  contractId: string,
  file: ReviewFile,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    confirmed: 0,
    edited: 0,
    rejected: 0,
    skipped: 0,
  };

  const pending = await prisma.obligation.findMany({
    where: {
      contractId,
      reviewStatus: "PENDING",
      id: { in: file.decisions.map(({ id }) => id) },
    },
  });
  const byId = new Map(pending.map((row) => [row.id, row]));

  for (const decision of file.decisions) {
    const obligation = byId.get(decision.id);
    if (!obligation) {
      summary.skipped++;
      continue;
    }
    byId.delete(decision.id);

    const common = {
      note: decision.note ?? null,
      reviewedBy: file.reviewer,
    };

    if (decision.decision === "EDITED") {
      const edit = obligationEditSchema.safeParse({
        ...editableFields(obligation),
        ...decision.edit,
      });
      if (!edit.success) {
        summary.skipped++;
        continue;
      }
      const result = await applyReview(contractId, obligation.id, {
        decision: "EDITED",
        edit: edit.data,
        ...common,
      });
      if (!result.ok) summary.skipped++;
      else if (result.status === "EDITED") summary.edited++;
      else summary.confirmed++;
      continue;
    }

    const result = await applyReview(contractId, obligation.id, {
      decision: decision.decision,
      ...common,
    });
    if (!result.ok) summary.skipped++;
    else if (decision.decision === "CONFIRMED") summary.confirmed++;
    else summary.rejected++;
  }

  return summary;
}
