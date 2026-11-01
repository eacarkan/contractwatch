import { describe, expect, it } from "vitest";

import { parseIsoDate as d } from "@/lib/deadline";
import { describeRule, parseRule } from "@/lib/deadline-text";
import { gateToken, isGateOpen, safeReturnPath } from "@/lib/demo-gate";
import { decideFromKey } from "@/lib/review/answer-key";
import { buildReviewPackage, parseReviewFile } from "@/lib/review/package";
import { buildTimeline } from "@/lib/timeline";

describe("the demo gate", () => {
  it("stays open with no password set", async () => {
    expect(await isGateOpen(undefined, undefined)).toBe(true);
  });

  it("needs the cookie signed with the password", async () => {
    const token = await gateToken("secret");
    expect(await isGateOpen("secret", token)).toBe(true);
    expect(await isGateOpen("secret", undefined)).toBe(false);
    expect(await isGateOpen("secret", "x".repeat(token.length))).toBe(false);
    expect(await isGateOpen("other", token)).toBe(false);
  });

  it("returns only to a path on this site", () => {
    expect(safeReturnPath("/en/contracts", "/f")).toBe("/en/contracts");
    expect(safeReturnPath("//evil.example", "/f")).toBe("/f");
    expect(safeReturnPath("/\\evil.example", "/f")).toBe("/f");
    expect(safeReturnPath("https://evil.example", "/f")).toBe("/f");
    expect(safeReturnPath(null, "/f")).toBe("/f");
  });
});

describe("rule wording", () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    `${key} ${JSON.stringify(values ?? {})}`;

  it("reads the stored codes", () => {
    expect(parseRule("after:21:CALENDAR_DAYS")).toEqual({
      kind: "after",
      value: 21,
      basis: "CALENDAR_DAYS",
      rolled: false,
    });
    expect(parseRule("periodic:30:2:rolled")).toEqual({
      kind: "periodic",
      days: 30,
      occurrence: 2,
      rolled: true,
    });
    expect(parseRule("nonsense")).toBeNull();
  });

  it("adds the extension to the wording, and shows an unknown code as it is", () => {
    expect(describeRule("before:3:MONTHS", t)).toBe(
      'before.MONTHS {"value":3}',
    );
    expect(describeRule("after:1:WORKING_DAYS:rolled", t)).toContain("rolled");
    expect(describeRule("nonsense", t)).toBe("nonsense");
  });
});

describe("buildTimeline", () => {
  const event = { id: "e", name: "Instruction", occurredOn: d("2025-03-12") };
  const deadline = {
    dueOn: d("2025-03-25"),
    status: "MET" as const,
    computedRule: "after:13:CALENDAR_DAYS",
    event,
  };
  const link = (date: string) => ({
    relation: "SATISFIES" as const,
    correspondence: {
      direction: "OUT" as const,
      sentOn: d(date),
      subject: "Notice",
      referenceNo: null,
    },
  });

  it("runs trigger, letters, then deadline by date", () => {
    const kinds = buildTimeline({
      deadlines: [deadline],
      links: [link("2025-03-20")],
    }).map(({ kind }) => kind);
    expect(kinds).toEqual(["trigger", "letter", "due"]);
  });

  it("puts a letter ahead of a deadline on the same day", () => {
    const kinds = buildTimeline({
      deadlines: [deadline],
      links: [link("2025-03-25")],
    }).map(({ kind }) => kind);
    expect(kinds).toEqual(["trigger", "letter", "due"]);
  });

  it("shows one trigger for an event with several occurrences", () => {
    const entries = buildTimeline({
      deadlines: [deadline, { ...deadline, dueOn: d("2025-04-25") }],
      links: [],
    });
    expect(entries.filter(({ kind }) => kind === "trigger")).toHaveLength(1);
  });
});

describe("the review file", () => {
  const VALID = {
    reviewer: "ChatGPT",
    decisions: [
      { id: "a", decision: "CONFIRMED" },
      { id: "b", decision: "REJECTED", note: "No period." },
      { id: "c", decision: "EDITED", edit: { periodValue: 15 } },
    ],
  };

  it("accepts a good file, fenced or not", () => {
    expect(parseReviewFile(JSON.stringify(VALID)).success).toBe(true);
    expect(
      parseReviewFile("```json\n" + JSON.stringify(VALID) + "\n```").success,
    ).toBe(true);
  });

  it.each([
    ["text that is not JSON", "not json"],
    ["no decisions", JSON.stringify({ reviewer: "X", decisions: [] })],
    [
      "an unknown decision",
      JSON.stringify({
        reviewer: "X",
        decisions: [{ id: "a", decision: "MAYBE" }],
      }),
    ],
    [
      "an edit to the quote",
      JSON.stringify({
        reviewer: "X",
        decisions: [
          { id: "a", decision: "EDITED", edit: { sourceQuote: "changed" } },
        ],
      }),
    ],
    [
      "an edit with an unknown value",
      JSON.stringify({
        reviewer: "X",
        decisions: [{ id: "a", decision: "EDITED", edit: { category: "NEW" } }],
      }),
    ],
  ])("refuses %s", (_name, text) => {
    expect(parseReviewFile(text).success).toBe(false);
  });

  it("packs each item with its clause text and the instructions", () => {
    const reviewPackage = buildReviewPackage({ name: "Demo", language: "fr" }, [
      {
        id: "a",
        clauseRef: "1.1",
        clause: { heading: "H", body: "Texte" },
        obligor: "CONTRACTOR",
        counterparty: null,
        category: "NOTICE",
        title: "T",
        description: "D",
        triggerType: "EVENT",
        triggerEvent: null,
        periodValue: 1,
        periodBasis: "CALENDAR_DAYS",
        periodDirection: "AFTER",
        recurrenceDays: null,
        isTimeBar: false,
        consequence: null,
        sourceQuote: "Q",
      },
    ]);
    expect(reviewPackage.items[0]!.clause_text).toBe("Texte");
    expect(reviewPackage.instructions.length).toBeGreaterThan(0);
    expect(
      parseReviewFile(JSON.stringify(reviewPackage.reply_format)).success,
    ).toBe(true);
  });
});

describe("decideFromKey", () => {
  const item = {
    id: "a",
    clauseRef: "1.1",
    obligor: "CONTRACTOR",
    category: "NOTICE",
    periodValue: 7,
    periodBasis: "CALENDAR_DAYS",
    isTimeBar: false,
  };
  const key = {
    clause_ref: "1.1",
    obligor: "CONTRACTOR",
    category: "NOTICE",
    period_value: 7,
    period_basis: "CALENDAR_DAYS",
    is_time_bar: false,
  };

  it("confirms an exact match", () => {
    expect(decideFromKey([item], [key])[0]!.decision).toBe("CONFIRMED");
  });

  it("corrects a difference to the key", () => {
    const [decision] = decideFromKey([{ ...item, periodValue: 9 }], [key]);
    expect(decision).toMatchObject({
      decision: "EDITED",
      edit: { periodValue: 7 },
    });
  });

  it("rejects what the key does not hold, and a second copy of one entry", () => {
    const decisions = decideFromKey(
      [item, { ...item, id: "b" }, { ...item, id: "c", clauseRef: "2.2" }],
      [key],
    );
    expect(decisions.map(({ decision }) => decision)).toEqual([
      "CONFIRMED",
      "REJECTED",
      "REJECTED",
    ]);
  });
});
