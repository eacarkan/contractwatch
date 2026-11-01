import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  MAX_CHARACTERS_PER_BATCH,
  MAX_CLAUSES_PER_BATCH,
  nextBatch,
} from "@/lib/llm/batches";
import { parseExtraction } from "@/lib/llm/parse";
import { oblV1 } from "@/lib/llm/prompts/obl-v1";
import { CURRENT_PROMPT } from "@/lib/llm/prompts";
import { oblV2 } from "@/lib/llm/prompts/obl-v2";
import { oblV3 } from "@/lib/llm/prompts/obl-v3";
import {
  CATEGORIES,
  DAY_BASES,
  OBLIGATIONS_TOOL,
  PARTY_ROLES,
  TRIGGER_TYPES,
  obligationSchema,
  QUOTE_MAX,
  TITLE_MAX,
} from "@/lib/llm/schemas/obligation";

const CLAUSE = {
  clauseRef: "S-1.1",
  body: "The Contractor shall notify the Employer\nwithin 10 days of the event.",
};

const OBLIGATION = {
  clause_ref: "S-1.1",
  obligor: "CONTRACTOR",
  category: "NOTICE",
  title: "Notify within 10 days",
  description: "The Contractor must notify the Employer.",
  trigger_type: "EVENT",
  period_value: 10,
  period_basis: "CALENDAR_DAYS",
  is_time_bar: false,
  source_quote: "notify the Employer within 10 days",
  confidence: 0.9,
};

function parseOne(changes: object) {
  return parseExtraction({ obligations: [{ ...OBLIGATION, ...changes }] }, [
    CLAUSE,
  ])[0]!;
}

describe("parseExtraction", () => {
  it("accepts a clean obligation, ignoring line breaks in the quote check", () => {
    expect(parseOne({}).flags).toEqual([]);
  });

  it("accepts an empty list", () => {
    expect(parseExtraction({ obligations: [] }, [CLAUSE])).toEqual([]);
  });

  it("accepts optional fields as null or left out", () => {
    expect(
      parseOne({ counterparty: null, period_value: null, period_basis: null })
        .flags,
    ).toEqual([]);
  });

  it("flags for review rather than rejecting", () => {
    expect(parseOne({ source_quote: "not in the clause" }).flags).toEqual([
      "quote-not-in-clause",
    ]);
    expect(parseOne({ clause_ref: "S-9.9" }).flags).toEqual([
      "unknown-clause-ref",
    ]);
    expect(parseOne({ period_basis: undefined }).flags).toEqual([
      "period-without-basis",
    ]);
  });

  it.each([
    ["an unknown category", { category: "MAYBE" }],
    ["a title over the limit", { title: "x".repeat(TITLE_MAX + 1) }],
    ["a fractional period", { period_value: 1.5 }],
    ["a confidence above 1", { confidence: 1.2 }],
    ["a missing time-bar flag", { is_time_bar: undefined }],
  ])("rejects %s", (_name, changes) => {
    expect(() => parseOne(changes)).toThrow(ZodError);
  });

  it("cuts an over-long quote at a word, keeping it verbatim and flagging it", () => {
    const words = "word ".repeat(QUOTE_MAX);
    const obligation = parseExtraction(
      { obligations: [{ ...OBLIGATION, source_quote: words }] },
      [{ clauseRef: "S-1.1", body: words }],
    )[0]!;
    expect(obligation.source_quote.length).toBeLessThanOrEqual(QUOTE_MAX);
    expect(obligation.source_quote.endsWith("word")).toBe(true);
    expect(obligation.flags).toEqual(["quote-shortened"]);
  });

  it("rejects output with no obligations list", () => {
    expect(() => parseExtraction({ items: [] }, [CLAUSE])).toThrow(ZodError);
  });
});

describe("the tool schema", () => {
  const items = OBLIGATIONS_TOOL.parameters.properties.obligations.items;

  it("lists the same fields as the zod schema", () => {
    expect(Object.keys(items.properties).sort()).toEqual(
      Object.keys(obligationSchema.shape).sort(),
    );
  });

  it("requires exactly what the zod schema requires", () => {
    const required = Object.entries(obligationSchema.shape)
      .filter(([, field]) => !field.safeParse(undefined).success)
      .map(([name]) => name);
    expect([...items.required].sort()).toEqual(required.sort());
  });
});

describe("the obl-v1 prompt", () => {
  const CONTRACT = { name: "Demo", type: "CCAG_TRAVAUX", language: "fr" };

  it("asks for titles in the contract's language", () => {
    expect(oblV1.system(CONTRACT)).toContain("in French");
    expect(oblV1.system({ ...CONTRACT, language: "en" })).toContain(
      "in English",
    );
  });

  it("lists the allowed values, which not every service passes on from the tool", () => {
    const system = oblV1.system(CONTRACT);
    for (const values of [PARTY_ROLES, CATEGORIES, TRIGGER_TYPES, DAY_BASES]) {
      expect(system).toContain(values.join(", "));
    }
  });

  it("has an example output that passes validation", () => {
    const [, example] = oblV1
      .system(CONTRACT)
      .split("Expected output for the example:\n");
    const clause = {
      clauseRef: "S-14.2",
      body: "Where the Contractor considers that an event entitles it to an extension of time, it shall notify the Project Manager in writing within 21 days of becoming aware of the event. If the Contractor fails to give such notice within 21 days, the Contractor shall not be entitled to an extension of time in respect of that event.",
    };
    const [obligation] = parseExtraction(JSON.parse(example!), [clause]);
    expect(obligation!.flags).toEqual([]);
  });

  it("escapes references and headings, and keeps clause text whole", () => {
    const user = oblV1.user(CONTRACT, [
      { clauseRef: "Art. 1", heading: 'Le "délai" <court>', body: "Texte." },
      { clauseRef: "Art. 2", heading: null, body: "Autre texte." },
    ]);
    expect(user).toContain(
      '<clause ref="Art. 1" heading="Le &quot;délai&quot; &lt;court>">Texte.</clause>',
    );
    expect(user).toContain('<clause ref="Art. 2" heading="">Autre texte.');
  });
});

describe("the obl-v2 prompt", () => {
  const CONTRACT = { name: "Demo", type: "CCAG_TRAVAUX", language: "fr" };

  it("keeps obl-v1's text and adds its own rules", () => {
    const system = oblV2.system(CONTRACT);
    expect(oblV2.version).toBe("obl-v2");
    expect(system.startsWith(oblV1.system(CONTRACT))).toBe(true);
    expect(system).toContain("is_time_bar is always true or false");
  });
});

describe("the obl-v3 prompt", () => {
  const CONTRACT = { name: "Demo", type: "CCAG_TRAVAUX", language: "fr" };

  it("is current, and adds category rules to obl-v2", () => {
    const system = oblV3.system(CONTRACT);
    expect(CURRENT_PROMPT.version).toBe("obl-v3");
    expect(system.startsWith(oblV2.system(CONTRACT))).toBe(true);
    expect(system).toContain("How to choose a category");
  });
});

describe("nextBatch", () => {
  const short = (count: number) =>
    Array.from({ length: count }, () => ({ body: "x".repeat(100) }));

  it("takes up to the clause limit", () => {
    expect(nextBatch(short(20))).toHaveLength(MAX_CLAUSES_PER_BATCH);
    expect(nextBatch(short(2))).toHaveLength(2);
    expect(nextBatch([])).toEqual([]);
  });

  it("stops before the character limit", () => {
    const half = { body: "x".repeat(MAX_CHARACTERS_PER_BATCH / 2 + 1) };
    expect(nextBatch([half, half, half])).toHaveLength(1);
  });

  it("gives an over-long clause a batch of its own, uncut", () => {
    const long = { body: "x".repeat(MAX_CHARACTERS_PER_BATCH * 2) };
    expect(nextBatch([long, ...short(3)])).toEqual([long]);
    expect(nextBatch([...short(1), long])).toHaveLength(1);
  });
});

describe("the repository's gold set", () => {
  it("is valid JSON with the expected keys", () => {
    const gold = JSON.parse(readFileSync("test/gold/ccag.json", "utf8"));
    expect(Object.keys(gold).sort()).toEqual([
      "holdoutClauseRefs",
      "labelledClauseRefs",
      "obligations",
    ]);
  });
});
