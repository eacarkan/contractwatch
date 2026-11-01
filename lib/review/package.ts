import { z } from "zod";

import {
  CATEGORIES,
  DAY_BASES,
  DIRECTIONS,
  PARTY_ROLES,
  TRIGGER_TYPES,
} from "@/lib/llm/schemas/obligation";

export const IMPORT_MAX_BYTES = 5_000_000;
const NOTE_MAX = 1000;

const INSTRUCTIONS = [
  "You are reviewing obligations a model extracted from a construction contract. Check each item against its clause_text and nothing else.",
  "For each item decide: CONFIRMED if every field is right, EDITED if it is a real obligation with a field wrong, REJECTED if the clause states no such time-bound obligation.",
  "For EDITED, put only the corrected fields in edit. source_quote and clause_ref cannot be edited. A period_value needs a period_basis.",
  "Check period_value, period_basis and is_time_bar with particular care. is_time_bar is true only when the clause says that missing the period loses a right.",
  "Give a short note saying why, for every EDITED and REJECTED item.",
  "Reply with one JSON file only, in exactly the shape of reply_format, with one decision for every item. Do not invent ids.",
];

const REPLY_FORMAT = {
  reviewer: "ChatGPT",
  decisions: [
    { id: "<item id>", decision: "CONFIRMED", note: null },
    {
      id: "<item id>",
      decision: "EDITED",
      edit: { periodValue: 15, periodBasis: "CALENDAR_DAYS" },
      note: "The clause says fifteen days.",
    },
    { id: "<item id>", decision: "REJECTED", note: "No period is stated." },
  ],
};

const ALLOWED_VALUES = {
  obligor: PARTY_ROLES,
  counterparty: PARTY_ROLES,
  category: CATEGORIES,
  triggerType: TRIGGER_TYPES,
  periodBasis: DAY_BASES,
  periodDirection: DIRECTIONS,
};

type PackageObligation = {
  id: string;
  clauseRef: string;
  clause: { heading: string | null; body: string } | null;
  obligor: string;
  counterparty: string | null;
  category: string;
  title: string;
  description: string;
  triggerType: string;
  triggerEvent: string | null;
  periodValue: number | null;
  periodBasis: string | null;
  periodDirection: string;
  recurrenceDays: number | null;
  isTimeBar: boolean;
  consequence: string | null;
  sourceQuote: string;
};

/** Everything an outside reviewer needs, in one file it can read on its own. */
export function buildReviewPackage(
  contract: { name: string; language: string },
  obligations: PackageObligation[],
) {
  return {
    instructions: INSTRUCTIONS,
    allowed_values: ALLOWED_VALUES,
    reply_format: REPLY_FORMAT,
    contract: { name: contract.name, language: contract.language },
    items: obligations.map(({ clause, ...obligation }) => ({
      ...obligation,
      clause_heading: clause?.heading ?? null,
      clause_text: clause?.body ?? null,
    })),
  };
}

/** Edits are limited to the fields a reviewer can judge; the quote stays the model's. */
const editSchema = z
  .object({
    obligor: z.enum(PARTY_ROLES),
    counterparty: z.enum(PARTY_ROLES).nullable(),
    category: z.enum(CATEGORIES),
    title: z.string().trim().min(1).max(90),
    description: z.string().trim().min(1),
    triggerType: z.enum(TRIGGER_TYPES),
    triggerEvent: z.string().trim().nullable(),
    periodValue: z.number().int().min(0).nullable(),
    periodBasis: z.enum(DAY_BASES).nullable(),
    periodDirection: z.enum(DIRECTIONS),
    recurrenceDays: z.number().int().min(1).nullable(),
    isTimeBar: z.boolean(),
    consequence: z.string().trim().nullable(),
  })
  .partial()
  .strict();

const note = z.string().trim().max(NOTE_MAX).nullish();

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ id: z.string(), decision: z.literal("CONFIRMED"), note }),
  z.object({ id: z.string(), decision: z.literal("REJECTED"), note }),
  z.object({
    id: z.string(),
    decision: z.literal("EDITED"),
    edit: editSchema,
    note,
  }),
]);

/** What the app trusts: an outside reviewer's file passes this before any write. */
export const reviewFileSchema = z.object({
  reviewer: z.string().trim().min(1).max(40),
  decisions: z.array(decisionSchema).min(1).max(2000),
});

export type ReviewFile = z.infer<typeof reviewFileSchema>;

export function parseReviewFile(text: string) {
  try {
    return reviewFileSchema.safeParse(
      JSON.parse(text.replace(/^```(?:json)?\s*|\s*```\s*$/g, "")),
    );
  } catch {
    return reviewFileSchema.safeParse(null);
  }
}
