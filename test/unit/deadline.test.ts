import { describe, expect, it } from "vitest";

import {
  addMonths,
  addWorkingDays,
  canGenerateDeadlines,
  computeDeadlines,
  daysUntil,
  deadlineView,
  isMetBy,
  isWorkingDay,
  MAX_OCCURRENCES,
  monthGrid,
  parseIsoDate,
  planRecompute,
  isoDate,
  type Calendar,
  type DeadlineRule,
} from "@/lib/deadline";

const d = parseIsoDate;
const NO_HOLIDAYS = new Set<string>();
const PLAIN: Calendar = { holidays: NO_HOLIDAYS, rollForward: false };
const ROLLING: Calendar = { holidays: NO_HOLIDAYS, rollForward: true };

const RULE: DeadlineRule = {
  triggerType: "EVENT",
  periodValue: 21,
  periodBasis: "CALENDAR_DAYS",
  periodDirection: "AFTER",
  recurrenceDays: null,
};

function due(rule: Partial<DeadlineRule>, from: string, calendar = PLAIN) {
  return computeDeadlines({ ...RULE, ...rule }, d(from), calendar).map(
    (deadline) => isoDate(deadline.dueOn),
  );
}

describe("calendar days", () => {
  it("does not count the day of the event", () => {
    expect(due({}, "2025-03-04")).toEqual(["2025-03-25"]);
  });

  it("crosses a month end", () => {
    expect(due({ periodValue: 10 }, "2025-01-28")).toEqual(["2025-02-07"]);
  });

  it("crosses a year end", () => {
    expect(due({ periodValue: 5 }, "2025-12-30")).toEqual(["2026-01-04"]);
  });

  it("counts 29 February in a leap year", () => {
    expect(due({ periodValue: 1 }, "2024-02-28")).toEqual(["2024-02-29"]);
  });

  it("keeps a period of zero on the event's own day", () => {
    expect(due({ periodValue: 0 }, "2025-03-04")).toEqual(["2025-03-04"]);
  });
});

describe("working days", () => {
  const basis = { periodBasis: "WORKING_DAYS" as const };

  it("skips a weekend", () => {
    // Friday plus one working day is the Monday.
    expect(due({ ...basis, periodValue: 1 }, "2025-03-07")).toEqual([
      "2025-03-10",
    ]);
  });

  it("skips a contract holiday", () => {
    const holidays = new Set(["2025-03-10"]);
    expect(
      due({ ...basis, periodValue: 1 }, "2025-03-07", {
        holidays,
        rollForward: false,
      }),
    ).toEqual(["2025-03-11"]);
  });

  it("does not count a start date that falls on a weekend", () => {
    expect(due({ ...basis, periodValue: 1 }, "2025-03-08")).toEqual([
      "2025-03-10",
    ]);
  });

  it("counts backwards over a weekend", () => {
    expect(isoDate(addWorkingDays(d("2025-03-10"), -1, NO_HOLIDAYS))).toBe(
      "2025-03-07",
    );
  });

  it("knows Saturdays, Sundays and holidays are not working days", () => {
    expect(isWorkingDay(d("2025-03-08"), NO_HOLIDAYS)).toBe(false);
    expect(isWorkingDay(d("2025-03-09"), NO_HOLIDAYS)).toBe(false);
    expect(isWorkingDay(d("2025-03-10"), new Set(["2025-03-10"]))).toBe(false);
    expect(isWorkingDay(d("2025-03-10"), NO_HOLIDAYS)).toBe(true);
  });
});

describe("months", () => {
  const basis = { periodBasis: "MONTHS" as const };

  it("counts from day to same day", () => {
    expect(due({ ...basis, periodValue: 3 }, "2025-03-04")).toEqual([
      "2025-06-04",
    ]);
  });

  it("clamps to the end of a shorter month", () => {
    expect(due({ ...basis, periodValue: 1 }, "2025-01-31")).toEqual([
      "2025-02-28",
    ]);
  });

  it("clamps to 29 February in a leap year", () => {
    expect(isoDate(addMonths(d("2024-01-31"), 1))).toBe("2024-02-29");
  });

  it("crosses a year end", () => {
    expect(due({ ...basis, periodValue: 2 }, "2025-11-15")).toEqual([
      "2026-01-15",
    ]);
  });
});

describe("before an event", () => {
  const before = { periodDirection: "BEFORE" as const, periodValue: 14 };

  it("counts backwards", () => {
    expect(due(before, "2025-03-15")).toEqual(["2025-03-01"]);
  });

  it("counts months backwards", () => {
    expect(
      due({ ...before, periodBasis: "MONTHS", periodValue: 1 }, "2025-03-31"),
    ).toEqual(["2025-02-28"]);
  });

  it("is not moved later when it lands on a weekend", () => {
    // 1 March 2025 is a Saturday: moving it on would make the submission late.
    expect(due(before, "2025-03-15", ROLLING)).toEqual(["2025-03-01"]);
  });
});

describe("a period ending on a non-working day", () => {
  it("runs on to the next working day when the contract says so", () => {
    // 4 March plus 25 days is Saturday 29 March.
    expect(due({ periodValue: 25 }, "2025-03-04", ROLLING)).toEqual([
      "2025-03-31",
    ]);
  });

  it("runs past a holiday following the weekend", () => {
    expect(
      due({ periodValue: 25 }, "2025-03-04", {
        holidays: new Set(["2025-03-31"]),
        rollForward: true,
      }),
    ).toEqual(["2025-04-01"]);
  });

  it("stays put when the contract does not say so", () => {
    expect(due({ periodValue: 25 }, "2025-03-04")).toEqual(["2025-03-29"]);
  });

  it("records the extension in the rule", () => {
    const [rolled] = computeDeadlines(
      { ...RULE, periodValue: 25 },
      d("2025-03-04"),
      ROLLING,
    );
    expect(rolled!.computedRule).toBe("after:25:CALENDAR_DAYS:rolled");
  });

  it("leaves a working-day result and its rule alone", () => {
    const [plain] = computeDeadlines(RULE, d("2025-03-04"), ROLLING);
    expect(isoDate(plain!.dueOn)).toBe("2025-03-25");
    expect(plain!.computedRule).toBe("after:21:CALENDAR_DAYS");
  });
});

describe("periodic obligations", () => {
  const periodic: DeadlineRule = {
    ...RULE,
    triggerType: "PERIODIC",
    periodValue: null,
    periodBasis: null,
    recurrenceDays: 30,
  };

  it("repeats up to the end of the works", () => {
    const rows = computeDeadlines(
      periodic,
      d("2025-01-01"),
      PLAIN,
      d("2025-04-01"),
    );
    expect(rows.map(({ dueOn }) => isoDate(dueOn))).toEqual([
      "2025-01-31",
      "2025-03-02",
      "2025-04-01",
    ]);
  });

  it("is capped", () => {
    const rows = computeDeadlines(
      { ...periodic, recurrenceDays: 1 },
      d("2025-01-01"),
      PLAIN,
      d("2035-01-01"),
    );
    expect(rows).toHaveLength(MAX_OCCURRENCES);
  });

  it("generates nothing without an end date", () => {
    expect(computeDeadlines(periodic, d("2025-01-01"), PLAIN)).toEqual([]);
  });

  it("numbers each occurrence in its rule", () => {
    const rows = computeDeadlines(
      periodic,
      d("2025-01-01"),
      PLAIN,
      d("2025-03-02"),
    );
    expect(rows[1]!.computedRule).toBe("periodic:30:2");
  });
});

describe("obligations with no usable period", () => {
  it("generate nothing", () => {
    expect(due({ periodValue: null }, "2025-03-04")).toEqual([]);
    expect(due({ periodBasis: null }, "2025-03-04")).toEqual([]);
  });

  it("are told apart from those that can", () => {
    expect(canGenerateDeadlines(RULE)).toBe(true);
    expect(canGenerateDeadlines({ ...RULE, periodValue: null })).toBe(false);
    expect(canGenerateDeadlines({ ...RULE, triggerType: "PERIODIC" })).toBe(
      false,
    );
    expect(
      canGenerateDeadlines({
        ...RULE,
        triggerType: "PERIODIC",
        recurrenceDays: 7,
      }),
    ).toBe(true);
  });
});

describe("planRecompute", () => {
  const next = (date: string) => ({
    dueOn: d(date),
    computedRule: "after:21:CALENDAR_DAYS",
  });
  const met = {
    id: "a",
    status: "MET" as const,
    metById: "letter",
    metOn: d("2025-03-20"),
  };

  it("keeps MET while the letter still precedes the new date", () => {
    const { update } = planRecompute([met], [next("2025-03-20")]);
    expect(update[0]).toMatchObject({ status: "MET", metById: "letter" });
  });

  it("reopens the deadline when the letter is now late", () => {
    const { update } = planRecompute([met], [next("2025-03-19")]);
    expect(update[0]).toMatchObject({ status: "OPEN", metById: null });
  });

  it("keeps a status set by hand", () => {
    const { update } = planRecompute(
      [{ id: "a", status: "WAIVED", metById: null, metOn: null }],
      [next("2025-04-01")],
    );
    expect(update[0]!.status).toBe("WAIVED");
  });

  it("keeps row ids, so links to the deadline survive", () => {
    const { update, create, remove } = planRecompute(
      [met],
      [next("2025-04-01")],
    );
    expect(update[0]!.id).toBe("a");
    expect(create).toEqual([]);
    expect(remove).toEqual([]);
  });

  it("adds occurrences a longer schedule needs", () => {
    const { create } = planRecompute(
      [met],
      [next("2025-04-01"), next("2025-05-01")],
    );
    expect(create).toHaveLength(1);
  });

  it("removes occurrences a shorter schedule no longer has", () => {
    const { remove, update } = planRecompute([met], []);
    expect(remove).toEqual(["a"]);
    expect(update).toEqual([]);
  });
});

describe("how a deadline is shown", () => {
  const today = d("2025-03-10");

  it("flags an open deadline past its date", () => {
    expect(
      deadlineView({ status: "OPEN", dueOn: d("2025-03-09") }, today),
    ).toBe("OVERDUE");
  });

  it("does not flag one due today", () => {
    expect(deadlineView({ status: "OPEN", dueOn: today }, today)).toBe("OPEN");
  });

  it("does not flag one already met", () => {
    expect(deadlineView({ status: "MET", dueOn: d("2025-03-01") }, today)).toBe(
      "MET",
    );
  });

  it("counts days to go", () => {
    expect(daysUntil(d("2025-03-24"), today)).toBe(14);
    expect(daysUntil(d("2025-03-09"), today)).toBe(-1);
  });
});

describe("isMetBy", () => {
  it("needs an outgoing letter sent by the due date", () => {
    const dueOn = d("2025-03-25");
    expect(isMetBy({ direction: "OUT", sentOn: d("2025-03-25") }, dueOn)).toBe(
      true,
    );
    expect(isMetBy({ direction: "OUT", sentOn: d("2025-03-26") }, dueOn)).toBe(
      false,
    );
    expect(isMetBy({ direction: "IN", sentOn: d("2025-03-20") }, dueOn)).toBe(
      false,
    );
  });
});

describe("monthGrid", () => {
  it("covers the month in Monday-first weeks", () => {
    const weeks = monthGrid(2025, 2);
    expect(isoDate(weeks[0]![0]!)).toBe("2025-02-24");
    expect(isoDate(weeks.at(-1)![6]!)).toBe("2025-04-06");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("adds no empty week when the month ends on a Sunday", () => {
    expect(isoDate(monthGrid(2025, 7).at(-1)![6]!)).toBe("2025-08-31");
    expect(isoDate(monthGrid(2025, 10).at(-1)![6]!)).toBe("2025-11-30");
  });
});
