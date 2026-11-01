import { describe, expect, it } from "vitest";

import { formatIsoDate, toCsv } from "@/lib/register/export";
import { filtersToQuery, parseFilters } from "@/lib/register/filters";
import {
  hasChanges,
  parseEditForm,
  reviewFlags,
  type ObligationEdit,
} from "@/lib/review/fields";
import { locateQuote } from "@/lib/text/locate-quote";

function form(fields: Record<string, string>) {
  const data = new FormData();
  Object.entries({
    clauseRef: "8.3",
    obligor: "CONTRACTOR",
    counterparty: "",
    category: "NOTICE",
    title: "Présenter les réserves",
    description: "Par écrit.",
    triggerType: "EVENT",
    triggerEvent: " ",
    periodValue: "15",
    periodBasis: "CALENDAR_DAYS",
    periodDirection: "AFTER",
    recurrenceDays: "",
    consequence: "",
    sourceQuote: "sous peine de forclusion",
    note: "",
    ...fields,
  }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("parseEditForm", () => {
  it("turns blanks into nulls and reads the numbers", () => {
    const { data } = parseEditForm(form({}));
    expect(data).toMatchObject({
      counterparty: null,
      triggerEvent: null,
      recurrenceDays: null,
      periodValue: 15,
      isTimeBar: false,
    });
    expect(data).not.toHaveProperty("note");
  });

  it("reads the time-bar checkbox", () => {
    const data = form({});
    data.set("isTimeBar", "on");
    expect(parseEditForm(data).data?.isTimeBar).toBe(true);
  });

  it.each([
    ["an empty title", { title: "  " }],
    ["a title over 90 characters", { title: "x".repeat(91) }],
    ["a quote over 400 characters", { sourceQuote: "x".repeat(401) }],
    ["a period with no unit", { periodBasis: "" }],
    ["a fractional period", { periodValue: "1.5" }],
    ["an unknown party", { obligor: "NOBODY" }],
    ["a recurrence of zero days", { recurrenceDays: "0" }],
  ])("rejects %s", (_name, fields) => {
    expect(parseEditForm(form(fields)).success).toBe(false);
  });
});

describe("hasChanges", () => {
  const edit = parseEditForm(form({})).data as ObligationEdit;

  it("spots a changed field and ignores an unchanged form", () => {
    expect(hasChanges(edit, { ...edit })).toBe(false);
    expect(hasChanges(edit, { ...edit, periodValue: 30 })).toBe(true);
  });
});

describe("reviewFlags", () => {
  it("splits saved codes", () => {
    expect(reviewFlags(null)).toEqual([]);
    expect(reviewFlags("a, b")).toEqual(["a", "b"]);
  });
});

describe("locateQuote", () => {
  const body = "Il doit,\nsous  peine de forclusion, agir (vite).";

  it("finds a quote across line breaks and spaces", () => {
    const found = locateQuote(body, "doit, sous peine de forclusion")!;
    expect(body.slice(found.start, found.end)).toBe(
      "doit,\nsous  peine de forclusion",
    );
  });

  it("treats punctuation literally", () => {
    expect(locateQuote(body, "agir (vite).")).not.toBeNull();
    expect(locateQuote(body, "agir .vite")).toBeNull();
  });

  it("returns nothing for a misquote or an empty quote", () => {
    expect(locateQuote(body, "sous peine ... forclusion")).toBeNull();
    expect(locateQuote(body, "  ")).toBeNull();
  });
});

describe("register filters", () => {
  it("keeps valid values and ignores anything else", () => {
    expect(
      parseFilters({ obligor: "EMPLOYER", category: "NOPE", timeBar: "yes" }),
    ).toEqual({ obligor: "EMPLOYER", timeBar: "yes" });
    expect(parseFilters({ status: "REJECTED", obligor: "" })).toEqual({});
  });

  it("leaves out empty filters from the export link", () => {
    expect(filtersToQuery({ timeBar: "no", obligor: undefined })).toBe(
      "timeBar=no",
    );
  });
});

describe("toCsv", () => {
  it("starts with a byte order mark and quotes where needed", () => {
    expect(toCsv([["a,b", 'dit "oui"', "é\nè", null, 15]])).toBe(
      '﻿"a,b","dit ""oui""","é\nè",,15\r\n',
    );
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd"])(
    "stops %s running as a spreadsheet formula",
    (value) => {
      expect(toCsv([[value]])).toBe(`﻿'${value}\r\n`);
    },
  );
});

describe("formatIsoDate", () => {
  it("gives a date or nothing", () => {
    expect(formatIsoDate(new Date("2027-01-31T00:00:00Z"))).toBe("2027-01-31");
    expect(formatIsoDate(undefined)).toBeNull();
  });
});
