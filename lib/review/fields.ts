import { z } from "zod";

import {
  DayBasis,
  ObligationCategory,
  PartyRole,
  PeriodDirection,
  TriggerType,
} from "@/lib/generated/prisma/enums";

export const LOW_CONFIDENCE = 0.6;

function blankToNull(value: unknown) {
  return value === "" || value === undefined ? null : value;
}

const optionalText = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.preprocess(blankToNull, z.string().nullable()),
);
const requiredText = z.string().trim().min(1);

function optionalWholeNumber(minimum: number) {
  return z.preprocess((value) => {
    const blank = blankToNull(value);
    return blank === null ? null : Number(blank);
  }, z.number().int().min(minimum).nullable());
}

export const obligationEditSchema = z
  .object({
    clauseRef: requiredText,
    obligor: z.enum(PartyRole),
    counterparty: z.preprocess(blankToNull, z.enum(PartyRole).nullable()),
    category: z.enum(ObligationCategory),
    title: requiredText.max(90),
    description: requiredText,
    triggerType: z.enum(TriggerType),
    triggerEvent: optionalText,
    periodValue: optionalWholeNumber(0),
    periodBasis: z.preprocess(blankToNull, z.enum(DayBasis).nullable()),
    periodDirection: z.enum(PeriodDirection),
    recurrenceDays: optionalWholeNumber(1),
    isTimeBar: z.boolean(),
    consequence: optionalText,
    sourceQuote: requiredText.max(400),
  })
  .refine((edit) => edit.periodValue === null || edit.periodBasis !== null, {
    path: ["periodBasis"],
  });

export type ObligationEdit = z.infer<typeof obligationEditSchema>;

export function parseEditForm(formData: FormData) {
  return obligationEditSchema.safeParse({
    ...Object.fromEntries(formData),
    isTimeBar: formData.get("isTimeBar") === "on",
  });
}

const EDITABLE_FIELDS = Object.keys(
  obligationEditSchema.shape,
) as (keyof ObligationEdit)[];

export function editableFields(obligation: ObligationEdit): ObligationEdit {
  return Object.fromEntries(
    EDITABLE_FIELDS.map((field) => [field, obligation[field]]),
  ) as ObligationEdit;
}

export function hasChanges(before: ObligationEdit, after: ObligationEdit) {
  return EDITABLE_FIELDS.some((field) => before[field] !== after[field]);
}

/** Saved model flags are codes, so that each screen can show them in its own language. */
export function reviewFlags(reviewNote: string | null) {
  return reviewNote ? reviewNote.split(", ") : [];
}
