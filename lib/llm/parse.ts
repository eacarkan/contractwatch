import {
  extractionSchema,
  type ExtractedObligation,
} from "@/lib/llm/schemas/obligation";

export type ReviewFlag =
  "quote-not-in-clause" | "unknown-clause-ref" | "period-without-basis";

export type CheckedObligation = ExtractedObligation & {
  flags: ReviewFlag[];
};

type BatchClause = { clauseRef: string; body: string };

function normaliseWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/** Throws a ZodError when the output does not match the schema. */
export function parseExtraction(
  input: unknown,
  clauses: BatchClause[],
): CheckedObligation[] {
  const { obligations } = extractionSchema.parse(input);
  const bodies = new Map(
    clauses.map(({ clauseRef, body }) => [
      clauseRef,
      normaliseWhitespace(body),
    ]),
  );

  return obligations.map((obligation) => {
    const flags: ReviewFlag[] = [];
    const body = bodies.get(obligation.clause_ref);

    if (body === undefined) {
      flags.push("unknown-clause-ref");
    } else if (!body.includes(normaliseWhitespace(obligation.source_quote))) {
      flags.push("quote-not-in-clause");
    }
    if (obligation.period_value != null && obligation.period_basis == null) {
      flags.push("period-without-basis");
    }

    return { ...obligation, flags };
  });
}
