import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  clausesInSubset,
  goldSetSchema,
  scoreExtraction,
  type Comparable,
} from "@/lib/llm/eval";

function item(changes: Partial<Comparable> = {}): Comparable {
  return {
    clause_ref: "Art. 1",
    obligor: "CONTRACTOR",
    category: "NOTICE",
    period_value: 10,
    period_basis: "CALENDAR_DAYS",
    is_time_bar: false,
    ...changes,
  };
}

const GOLD_ITEM = {
  clause_ref: "Art. 1",
  obligor: "CONTRACTOR",
  category: "NOTICE",
  title: "Notify",
  trigger_type: "EVENT",
  is_time_bar: false,
  source_quote: "notifie",
};

describe("scoreExtraction", () => {
  it("scores a perfect result as 1 on all four metrics", () => {
    const scores = scoreExtraction([item()], [item()]);
    expect(scores).toMatchObject({
      recall: 1,
      precision: 1,
      periodMatch: 1,
      timeBarAccuracy: 1,
    });
  });

  it("counts recall and precision by clause, obligor and category", () => {
    const scores = scoreExtraction(
      [item(), item({ clause_ref: "Art. 2" })],
      [item(), item({ obligor: "EMPLOYER" }), item({ category: "PAYMENT" })],
    );
    expect(scores.recall).toBe(0.5);
    expect(scores.precision).toBeCloseTo(1 / 3);
    expect(scores.missed).toHaveLength(1);
    expect(scores.falsePositives).toHaveLength(2);
  });

  it("uses each item once when a clause repeats a key", () => {
    const scores = scoreExtraction([item()], [item(), item()]);
    expect(scores.counts.matched).toBe(1);
    expect(scores.precision).toBe(0.5);
  });

  it("pairs the prediction with the same period first", () => {
    const scores = scoreExtraction(
      [item({ period_value: 10 }), item({ period_value: 30 })],
      [item({ period_value: 30 }), item({ period_value: 10 })],
    );
    expect(scores.periodMatch).toBe(1);
  });

  it("measures periods only where gold has one, on value and basis", () => {
    const scores = scoreExtraction(
      [
        item(),
        item({ clause_ref: "Art. 2" }),
        item({ clause_ref: "Art. 3", period_value: null, period_basis: null }),
      ],
      [
        item({ period_basis: "WORKING_DAYS" }),
        item({ clause_ref: "Art. 2" }),
        item({ clause_ref: "Art. 3", period_value: 99 }),
      ],
    );
    expect(scores.periodMatch).toBe(0.5);
  });

  it("measures the time-bar flag among matches", () => {
    const scores = scoreExtraction(
      [item({ is_time_bar: true }), item({ clause_ref: "Art. 2" })],
      [item({ is_time_bar: false }), item({ clause_ref: "Art. 2" })],
    );
    expect(scores.timeBarAccuracy).toBe(0.5);
  });

  it("reports no number rather than a misleading one on empty input", () => {
    expect(scoreExtraction([], [])).toMatchObject({
      recall: null,
      precision: null,
      periodMatch: null,
      timeBarAccuracy: null,
    });
  });
});

describe("goldSetSchema", () => {
  it("accepts a labelled set without confidence or description", () => {
    expect(() =>
      goldSetSchema.parse({
        labelledClauseRefs: ["Art. 1", "Art. 2"],
        holdoutClauseRefs: ["Art. 2"],
        obligations: [GOLD_ITEM],
      }),
    ).not.toThrow();
  });

  it("rejects an obligation or holdout in a clause not marked as labelled", () => {
    expect(() =>
      goldSetSchema.parse({
        labelledClauseRefs: [],
        holdoutClauseRefs: [],
        obligations: [GOLD_ITEM],
      }),
    ).toThrow(/Art\. 1 is not in labelledClauseRefs/);
    expect(() =>
      goldSetSchema.parse({
        labelledClauseRefs: [],
        holdoutClauseRefs: ["Art. 9"],
        obligations: [],
      }),
    ).toThrow(/Art\. 9 is not in labelledClauseRefs/);
  });

  it("accepts the repository's gold set", () => {
    const gold = JSON.parse(readFileSync("test/gold/ccag.json", "utf8"));
    expect(() => goldSetSchema.parse(gold)).not.toThrow();
  });
});

describe("clausesInSubset", () => {
  const gold = goldSetSchema.parse({
    labelledClauseRefs: ["Art. 1", "Art. 2", "Art. 3"],
    holdoutClauseRefs: ["Art. 3"],
    obligations: [],
  });

  it("separates development clauses from held-out clauses", () => {
    expect([...clausesInSubset(gold, "all")]).toHaveLength(3);
    expect([...clausesInSubset(gold, "dev")]).toEqual(["Art. 1", "Art. 2"]);
    expect([...clausesInSubset(gold, "holdout")]).toEqual(["Art. 3"]);
  });
});
