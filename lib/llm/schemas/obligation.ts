import { z } from "zod";

export const PARTY_ROLES = [
  "CONTRACTOR",
  "EMPLOYER",
  "ENGINEER",
  "EITHER",
  "OTHER",
] as const;
export const CATEGORIES = [
  "NOTICE",
  "SUBMISSION",
  "PAYMENT",
  "APPROVAL",
  "PROGRAMME",
  "INSURANCE",
  "SECURITY",
  "TESTING",
  "COMPLETION",
  "DEFECTS",
  "VARIATION",
  "CLAIM",
  "DISPUTE",
  "OTHER",
] as const;
export const TRIGGER_TYPES = [
  "FIXED_DATE",
  "EVENT",
  "PERIODIC",
  "ON_DEMAND",
] as const;
export const DAY_BASES = ["CALENDAR_DAYS", "WORKING_DAYS", "MONTHS"] as const;
export const DIRECTIONS = ["AFTER", "BEFORE"] as const;

export const TITLE_MAX = 90;
export const QUOTE_MAX = 400;

/** What the database trusts: every model response passes this before any write. */
export const obligationSchema = z.object({
  clause_ref: z.string().min(1),
  obligor: z.enum(PARTY_ROLES),
  counterparty: z.enum(PARTY_ROLES).nullish(),
  category: z.enum(CATEGORIES),
  title: z.string().min(1).max(TITLE_MAX),
  description: z.string().min(1),
  trigger_type: z.enum(TRIGGER_TYPES),
  trigger_event: z.string().nullish(),
  period_value: z.number().int().min(0).nullish(),
  period_basis: z.enum(DAY_BASES).nullish(),
  period_direction: z.enum(DIRECTIONS).nullish(),
  recurrence_days: z.number().int().min(1).nullish(),
  is_time_bar: z.boolean(),
  consequence: z.string().nullish(),
  source_quote: z.string().min(1).max(QUOTE_MAX),
  confidence: z.number().min(0).max(1),
});

export const extractionSchema = z.object({
  obligations: z.array(obligationSchema),
});

export type ExtractedObligation = z.infer<typeof obligationSchema>;

export const OBLIGATIONS_TOOL = {
  name: "record_obligations",
  description:
    "Records the time-bound obligations found in the clauses. Pass an empty list if there are none.",
  // Optional fields are left out rather than typed as nullable, because the free
  // model services do not all accept the same way of writing a null in a schema.
  parameters: {
    type: "object",
    required: ["obligations"],
    properties: {
      obligations: {
        type: "array",
        items: {
          type: "object",
          required: [
            "clause_ref",
            "obligor",
            "category",
            "title",
            "description",
            "trigger_type",
            "is_time_bar",
            "source_quote",
            "confidence",
          ],
          properties: {
            clause_ref: { type: "string" },
            obligor: { type: "string", enum: PARTY_ROLES },
            counterparty: { type: "string", enum: PARTY_ROLES },
            category: { type: "string", enum: CATEGORIES },
            title: { type: "string", maxLength: TITLE_MAX },
            description: { type: "string" },
            trigger_type: { type: "string", enum: TRIGGER_TYPES },
            trigger_event: { type: "string" },
            period_value: { type: "integer" },
            period_basis: { type: "string", enum: DAY_BASES },
            period_direction: { type: "string", enum: DIRECTIONS },
            recurrence_days: { type: "integer" },
            is_time_bar: { type: "boolean" },
            consequence: { type: "string" },
            source_quote: { type: "string", maxLength: QUOTE_MAX },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
  },
};
