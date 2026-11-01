/** Reads a stored rule code (see computeDeadlines) so a screen can word it. */
export type ParsedRule =
  | {
      kind: "after" | "before";
      value: number;
      basis: "CALENDAR_DAYS" | "WORKING_DAYS" | "MONTHS";
      rolled: boolean;
    }
  | { kind: "periodic"; days: number; occurrence: number; rolled: boolean };

export function parseRule(code: string): ParsedRule | null {
  const [kind, first, second, flag] = code.split(":");
  const rolled = flag === "rolled";
  if (kind === "periodic") {
    return {
      kind,
      days: Number(first),
      occurrence: Number(second),
      rolled,
    };
  }
  if (
    (kind === "after" || kind === "before") &&
    (second === "CALENDAR_DAYS" ||
      second === "WORKING_DAYS" ||
      second === "MONTHS")
  ) {
    return { kind, value: Number(first), basis: second, rolled };
  }
  return null;
}

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export function describeRule(code: string, t: Translate) {
  const rule = parseRule(code);
  if (!rule) return code;
  const text =
    rule.kind === "periodic"
      ? t("periodic", { days: rule.days, occurrence: rule.occurrence })
      : t(`${rule.kind}.${rule.basis}`, { value: rule.value });
  return rule.rolled ? `${text} ${t("rolled")}` : text;
}
