"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { applyReview } from "@/lib/review/apply";
import { parseEditForm } from "@/lib/review/fields";
import { importReviewFile, type ImportSummary } from "@/lib/review/import";
import { IMPORT_MAX_BYTES, parseReviewFile } from "@/lib/review/package";

const noteSchema = z.string().trim().max(1000).nullable();

export type ReviewActionResult = {
  error: "invalid" | "notFound" | "unknownClause" | null;
};

export async function reviewObligation(
  contractId: string,
  obligationId: string,
  decision: "CONFIRMED" | "EDITED" | "REJECTED",
  formData: FormData,
): Promise<ReviewActionResult> {
  const note = noteSchema.safeParse(formData.get("note"));
  if (!note.success) return { error: "invalid" };

  let result;
  if (decision === "EDITED") {
    const edit = parseEditForm(formData);
    if (!edit.success) return { error: "invalid" };
    result = await applyReview(contractId, obligationId, {
      decision,
      edit: edit.data,
      note: note.data,
    });
  } else {
    result = await applyReview(contractId, obligationId, {
      decision,
      note: note.data,
    });
  }
  if (!result.ok) return { error: result.error };

  revalidatePath("/[locale]/contracts/[id]", "layout");
  return { error: null };
}

export type ImportState = {
  error: "invalid" | null;
  summary: ImportSummary | null;
};

export async function importReview(
  contractId: string,
  _state: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size > IMPORT_MAX_BYTES) {
    return { error: "invalid", summary: null };
  }

  const parsed = parseReviewFile(await file.text());
  if (!parsed.success) return { error: "invalid", summary: null };

  const summary = await importReviewFile(contractId, parsed.data);
  revalidatePath("/[locale]/contracts/[id]", "layout");
  return { error: null, summary };
}
