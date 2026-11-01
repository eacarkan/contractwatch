import { z } from "zod";

export const RELATIONS = [
  "SATISFIES",
  "RESPONDS_TO",
  "REFERS_TO",
  "DISPUTES",
] as const;

export const MAX_MATCHES = 5;

/** What the app trusts: every model response passes this before anything is shown. */
export const matchSchema = z.object({
  summary: z.string().min(1).max(600),
  matches: z
    .array(
      z.object({
        obligation_id: z.string().min(1),
        relation: z.enum(RELATIONS),
        confidence: z.number().min(0).max(1),
        reason: z.string().min(1).max(400),
      }),
    )
    .max(MAX_MATCHES),
});

export type MatchResult = z.infer<typeof matchSchema>;

export const MATCH_TOOL = {
  name: "suggest_links",
  description:
    "Record a one-sentence summary of the letter and the obligations it most likely relates to.",
  parameters: {
    type: "object",
    required: ["summary", "matches"],
    properties: {
      summary: { type: "string" },
      matches: {
        type: "array",
        maxItems: MAX_MATCHES,
        items: {
          type: "object",
          required: ["obligation_id", "relation", "confidence", "reason"],
          properties: {
            obligation_id: { type: "string" },
            relation: { enum: RELATIONS },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" },
          },
        },
      },
    },
  },
};
