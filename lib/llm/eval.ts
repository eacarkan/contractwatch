import { z } from "zod";

import { obligationSchema } from "@/lib/llm/schemas/obligation";

/** The hand-labelled set: the extraction shape, without the model's own confidence. */
export const goldSetSchema = z
  .object({
    /** Every clause read while labelling, including those with no obligation. */
    labelledClauseRefs: z.array(z.string()),
    /** Clauses kept out of prompt work, so one score is not fitted to the prompt. */
    holdoutClauseRefs: z.array(z.string()),
    obligations: z.array(
      obligationSchema.omit({ confidence: true }).extend({
        description: z.string().optional(),
      }),
    ),
  })
  .superRefine((gold, context) => {
    const labelled = new Set(gold.labelledClauseRefs);
    gold.holdoutClauseRefs.forEach((ref, index) => {
      if (!labelled.has(ref)) {
        context.addIssue({
          code: "custom",
          path: ["holdoutClauseRefs", index],
          message: `${ref} is not in labelledClauseRefs`,
        });
      }
    });
    gold.obligations.forEach(({ clause_ref }, index) => {
      if (!labelled.has(clause_ref)) {
        context.addIssue({
          code: "custom",
          path: ["obligations", index, "clause_ref"],
          message: `${clause_ref} is not in labelledClauseRefs`,
        });
      }
    });
  });

export type GoldSet = z.infer<typeof goldSetSchema>;
export type GoldSubset = "all" | "dev" | "holdout";

export type Comparable = {
  clause_ref: string;
  obligor: string;
  category: string;
  period_value?: number | null;
  period_basis?: string | null;
  is_time_bar: boolean;
};

export type Scores<T extends Comparable, U extends Comparable> = {
  recall: number | null;
  precision: number | null;
  periodMatch: number | null;
  timeBarAccuracy: number | null;
  counts: { gold: number; predicted: number; matched: number };
  missed: T[];
  falsePositives: U[];
};

/** The clauses a score covers: labelled, in the chosen subset. */
export function clausesInSubset(gold: GoldSet, subset: GoldSubset) {
  const holdout = new Set(gold.holdoutClauseRefs);
  return new Set(
    gold.labelledClauseRefs.filter(
      (ref) => subset === "all" || (subset === "holdout") === holdout.has(ref),
    ),
  );
}

function matchKey({ clause_ref, obligor, category }: Comparable) {
  return `${clause_ref}|${obligor}|${category}`;
}

function samePeriod(a: Comparable, b: Comparable) {
  return (
    (a.period_value ?? null) === (b.period_value ?? null) &&
    (a.period_basis ?? null) === (b.period_basis ?? null)
  );
}

function ratio(part: number, whole: number) {
  return whole === 0 ? null : part / whole;
}

/**
 * Matches on clause reference, obligor and category. A clause can hold several
 * obligations with the same key, so each gold item is used once, and a prediction
 * with the same period is paired first.
 */
export function scoreExtraction<T extends Comparable, U extends Comparable>(
  gold: T[],
  predicted: U[],
): Scores<T, U> {
  const available = [...predicted];
  const pairs: { gold: T; predicted: U }[] = [];
  const missed: T[] = [];

  for (const item of gold) {
    const candidates = available.filter(
      (prediction) => matchKey(prediction) === matchKey(item),
    );
    const match =
      candidates.find((prediction) => samePeriod(prediction, item)) ??
      candidates[0];
    if (match) {
      available.splice(available.indexOf(match), 1);
      pairs.push({ gold: item, predicted: match });
    } else {
      missed.push(item);
    }
  }

  const withPeriod = pairs.filter((pair) => pair.gold.period_value != null);

  return {
    recall: ratio(pairs.length, gold.length),
    precision: ratio(pairs.length, predicted.length),
    periodMatch: ratio(
      withPeriod.filter((pair) => samePeriod(pair.gold, pair.predicted)).length,
      withPeriod.length,
    ),
    timeBarAccuracy: ratio(
      pairs.filter(
        (pair) => pair.gold.is_time_bar === pair.predicted.is_time_bar,
      ).length,
      pairs.length,
    ),
    counts: {
      gold: gold.length,
      predicted: predicted.length,
      matched: pairs.length,
    },
    missed,
    falsePositives: available,
  };
}
