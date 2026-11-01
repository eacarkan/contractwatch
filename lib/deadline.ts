/**
 * The due-date engine. Pure functions over UTC dates, because Postgres `date`
 * columns arrive as UTC midnight and local arithmetic would shift them across
 * daylight saving changes.
 */
import type {
  DayBasis,
  DeadlineStatus,
  PeriodDirection,
  TriggerType,
} from "@/lib/generated/prisma/enums";

export const MAX_OCCURRENCES = 60;

const DAY_MS = 86_400_000;

export type DeadlineRule = {
  triggerType: TriggerType;
  periodValue: number | null;
  periodBasis: DayBasis | null;
  periodDirection: PeriodDirection;
  recurrenceDays: number | null;
};

export type Calendar = {
  /** Non-working days of the contract, as yyyy-mm-dd. */
  holidays: ReadonlySet<string>;
  /** A period ending on a non-working day runs on to the next working day. */
  rollForward: boolean;
};

export type ComputedDeadline = { dueOn: Date; computedRule: string };

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Counts from day to same day, ending on the last day of a shorter month. */
export function addMonths(date: Date, months: number) {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

export function isWorkingDay(date: Date, holidays: ReadonlySet<string>) {
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(isoDate(date));
}

export function addWorkingDays(
  date: Date,
  days: number,
  holidays: ReadonlySet<string>,
) {
  const step = days < 0 ? -1 : 1;
  let current = date;
  for (let left = Math.abs(days); left > 0;) {
    current = addDays(current, step);
    if (isWorkingDay(current, holidays)) left--;
  }
  return current;
}

function nextWorkingDay(date: Date, holidays: ReadonlySet<string>) {
  let current = date;
  while (!isWorkingDay(current, holidays)) current = addDays(current, 1);
  return current;
}

function applyPeriod(
  from: Date,
  value: number,
  basis: DayBasis,
  direction: PeriodDirection,
  holidays: ReadonlySet<string>,
) {
  const signed = direction === "BEFORE" ? -value : value;
  if (basis === "MONTHS") return addMonths(from, signed);
  if (basis === "WORKING_DAYS") return addWorkingDays(from, signed, holidays);
  // The day of the event is not counted: 21 days from the 1st falls on the 22nd.
  return addDays(from, signed);
}

/**
 * The rule is stored as a code, so that each screen can word it in its own
 * language: `<after|before>:<value>:<basis>[:rolled]` or
 * `periodic:<days>:<occurrence>[:rolled]`.
 */
export function computeDeadlines(
  rule: DeadlineRule,
  eventDate: Date,
  calendar: Calendar,
  endOfWorks: Date | null = null,
): ComputedDeadline[] {
  const { holidays, rollForward } = calendar;

  // Only a period counted forwards is extended; moving a date due before an
  // event to a later day would make it late.
  const finish = (date: Date, code: string, canRoll: boolean) => {
    const rolled =
      canRoll && rollForward ? nextWorkingDay(date, holidays) : date;
    return {
      dueOn: rolled,
      computedRule:
        rolled.getTime() === date.getTime() ? code : `${code}:rolled`,
    };
  };

  if (rule.triggerType === "PERIODIC" && rule.recurrenceDays) {
    const occurrences: ComputedDeadline[] = [];
    for (let index = 1; index <= MAX_OCCURRENCES; index++) {
      const date = addDays(eventDate, rule.recurrenceDays * index);
      if (!endOfWorks || date > endOfWorks) break;
      occurrences.push(
        finish(date, `periodic:${rule.recurrenceDays}:${index}`, true),
      );
    }
    return occurrences;
  }

  if (rule.periodValue === null || rule.periodBasis === null) return [];

  const direction = rule.periodDirection;
  return [
    finish(
      applyPeriod(
        eventDate,
        rule.periodValue,
        rule.periodBasis,
        direction,
        holidays,
      ),
      `${direction.toLowerCase()}:${rule.periodValue}:${rule.periodBasis}`,
      direction === "AFTER",
    ),
  ];
}

export function canGenerateDeadlines(rule: DeadlineRule) {
  return rule.triggerType === "PERIODIC"
    ? Boolean(rule.recurrenceDays)
    : rule.periodValue !== null && rule.periodBasis !== null;
}

export type ExistingDeadline = {
  id: string;
  status: DeadlineStatus;
  metById: string | null;
  /** The date of the letter that met this deadline, if one did. */
  metOn: Date | null;
};

export type DeadlineChanges = {
  update: {
    id: string;
    dueOn: Date;
    computedRule: string;
    status: DeadlineStatus;
    metById: string | null;
  }[];
  create: ComputedDeadline[];
  remove: string[];
};

/**
 * Lines old rows up with new dates by occurrence, so links to a deadline survive
 * a recompute. MET stands only while its letter still precedes the new date, and
 * a status someone set by hand is kept.
 */
export function planRecompute(
  existing: readonly ExistingDeadline[],
  computed: readonly ComputedDeadline[],
): DeadlineChanges {
  const update = computed.slice(0, existing.length).map((next, index) => {
    const old = existing[index]!;
    const stillMet =
      old.status === "MET" && old.metOn !== null && old.metOn <= next.dueOn;
    const met = old.status === "MET";
    return {
      id: old.id,
      ...next,
      status: met && !stillMet ? ("OPEN" as const) : old.status,
      metById: stillMet ? old.metById : null,
    };
  });

  return {
    update,
    create: computed.slice(existing.length),
    remove: existing.slice(computed.length).map(({ id }) => id),
  };
}

export type DeadlineView =
  "MET" | "WAIVED" | "NOT_APPLICABLE" | "OVERDUE" | "OPEN";

/** Overdue is worked out when shown, so it cannot go stale in the database. */
export function deadlineView(
  deadline: { status: DeadlineStatus; dueOn: Date },
  today: Date,
): DeadlineView {
  if (deadline.status === "MISSED") return "OVERDUE";
  if (deadline.status !== "OPEN") return deadline.status;
  return deadline.dueOn < today ? "OVERDUE" : "OPEN";
}

export function isMetBy(
  letter: { direction: "IN" | "OUT"; sentOn: Date },
  dueOn: Date,
) {
  return letter.direction === "OUT" && letter.sentOn <= dueOn;
}

export function daysUntil(dueOn: Date, today: Date) {
  return Math.round((dueOn.getTime() - today.getTime()) / DAY_MS);
}

export function todayUtc(now = new Date()) {
  return parseIsoDate(now.toISOString().slice(0, 10));
}

/** Monday-first weeks covering the month, each day as a UTC date. */
export function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = addDays(first, -((first.getUTCDay() + 6) % 7));
  const last = new Date(Date.UTC(year, month + 1, 0));

  const weeks: Date[][] = [];
  for (let day = start; day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(day, index)));
  }
  return weeks;
}
