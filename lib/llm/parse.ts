import {
  extractionSchema,
  QUOTE_MAX,
  type ExtractedObligation,
} from "@/lib/llm/schemas/obligation";

export type ReviewFlag =
  | "quote-not-in-clause"
  | "quote-shortened"
  | "unknown-clause-ref"
  | "period-without-basis";

export type CheckedObligation = ExtractedObligation & {
  flags: ReviewFlag[];
};

type BatchClause = { clauseRef: string; body: string };

function normaliseWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

/** A cut quote is still word for word from the clause, so the item need not be lost. */
function shortenQuote(quote: string) {
  const cut = quote.slice(0, QUOTE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
}

function shortenLongQuotes(input: unknown): {
  input: unknown;
  cut: Set<number>;
} {
  const cut = new Set<number>();
  const obligations = (input as { obligations?: unknown } | null)?.obligations;
  if (!Array.isArray(obligations)) return { input, cut };

  return {
    cut,
    input: {
      obligations: obligations.map((item, index) => {
        const quote = (item as { source_quote?: unknown } | null)?.source_quote;
        if (typeof quote !== "string" || quote.length <= QUOTE_MAX) return item;
        cut.add(index);
        return { ...(item as object), source_quote: shortenQuote(quote) };
      }),
    },
  };
}

/** Throws a ZodError when the output does not match the schema. */
export function parseExtraction(
  input: unknown,
  clauses: BatchClause[],
): CheckedObligation[] {
  const shortened = shortenLongQuotes(input);
  const { obligations } = extractionSchema.parse(shortened.input);
  const bodies = new Map(
    clauses.map(({ clauseRef, body }) => [
      clauseRef,
      normaliseWhitespace(body),
    ]),
  );

  return obligations.map((obligation, index) => {
    const flags: ReviewFlag[] = [];
    if (shortened.cut.has(index)) flags.push("quote-shortened");
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
