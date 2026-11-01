/**
 * Replaces names and shifts dates in contract text, then reports anything it could
 * not handle. A silent miss here would put real data in a public repository, so
 * scripts/anonymise.ts refuses to write its output while that report is not empty.
 */

export type NameMap = Record<string, string>;

export type ResidualKind =
  | "unreadable-date"
  | "partial-date"
  | "year"
  | "amount"
  | "reference"
  | "contact";

export type Residual = { kind: ResidualKind; text: string; count: number };

export type AnonymiseResult = {
  text: string;
  namesReplaced: number;
  datesShifted: number;
  residuals: Residual[];
};

const PAGE_BREAK = "\f";

// Finished replacements become private-use placeholders until the end, so a shifted
// date is not shifted twice, and replacement values do not trigger the residual checks.
const RESERVED_CHARACTERS = /[-]/u;

function createPlaceholders() {
  const values: string[] = [];
  return {
    put(value: string): string {
      const digits = (values.push(value) - 1).toString(16);
      const encoded = [...digits]
        .map((digit) =>
          String.fromCodePoint(0xe010 + Number.parseInt(digit, 16)),
        )
        .join("");
      return `${encoded}`;
    },
    resolve(text: string): string {
      return text.replace(/([-]+)/gu, (_match, encoded: string) => {
        const digits = [...encoded]
          .map((character) => (character.codePointAt(0)! - 0xe010).toString(16))
          .join("");
        return values[Number.parseInt(digits, 16)];
      });
    },
  };
}

function isAllCaps(text: string): boolean {
  return text === text.toUpperCase() && text !== text.toLowerCase();
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

const ACCENT_VARIANTS: Record<string, string> = {
  a: "aàâäáã",
  c: "cç",
  e: "eéèêë",
  i: "iîïí",
  n: "nñ",
  o: "oôöó",
  u: "uùûüú",
  y: "yÿ",
};

/** Matches a name whatever its capitals or accents, and across line breaks and hyphens. */
function namePattern(name: string): string {
  const base = stripAccents(name).toLowerCase();
  let pattern = "";
  for (let index = 0; index < base.length; index++) {
    const character = base[index];
    if (/[\s‐-―-]/u.test(character)) {
      while (/[\s‐-―-]/u.test(base[index + 1] ?? "")) index++;
      pattern += "[\\s\\u2010-\\u2015-]+";
    } else if (character === "'" || character === "’") {
      pattern += "['’]";
    } else if (base.startsWith("oe", index) || character === "œ") {
      pattern += "(?:oe|œ)";
      if (character !== "œ") index++;
    } else if (base.startsWith("ae", index) || character === "æ") {
      pattern += "(?:ae|æ)";
      if (character !== "æ") index++;
    } else if (ACCENT_VARIANTS[character]) {
      pattern += `[${ACCENT_VARIANTS[character]}]`;
    } else {
      pattern += character.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
    }
  }
  // The boundaries stop a short name matching inside a longer word.
  return `(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`;
}

/** Longest first, so "Alpha Travaux Publics" is not cut short by "Alpha". */
function buildNameMatcher(names: NameMap) {
  const keys = Object.keys(names).sort((a, b) => b.length - a.length);
  return {
    keys,
    regex: new RegExp(
      keys.map((key, index) => `(?<k${index}>${namePattern(key)})`).join("|"),
      "giu",
    ),
  };
}

/** True when any real name appears in this text. */
export function containsName(text: string, names: NameMap): boolean {
  return new RegExp(buildNameMatcher(names).regex.source, "iu").test(text);
}

function replaceNames(
  text: string,
  names: NameMap,
  put: (value: string) => string,
): { text: string; count: number } {
  const { keys, regex } = buildNameMatcher(names);
  let count = 0;
  const replaced = text.replace(regex, (...args) => {
    const match: string = args[0];
    const groups = args.at(-1) as Record<string, string | undefined>;
    const index = keys.findIndex((_, keyIndex) => groups[`k${keyIndex}`]);
    const value = names[keys[index]];
    count += 1;
    // Keep any page break the name happened to span, so page numbers stay right.
    const pageBreaks = PAGE_BREAK.repeat(match.split(PAGE_BREAK).length - 1);
    return put((isAllCaps(match) ? value.toUpperCase() : value) + pageBreaks);
  });
  return { text: replaced, count };
}

type Language = "fr" | "en";

const MONTHS: Record<Language, { full: string[]; short: string[] }> = {
  fr: {
    full: "janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split(
      " ",
    ),
    short: "janv févr mars avr mai juin juil août sept oct nov déc".split(" "),
  },
  en: {
    full: "January February March April May June July August September October November December".split(
      " ",
    ),
    short: "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" "),
  },
};

type MonthEntry = { month: number; language: Language; isShort: boolean };

const MONTH_LOOKUP = new Map<string, MonthEntry>();
// French goes first, so abbreviations both languages share ("oct", "nov") read as French.
for (const language of ["fr", "en"] as const) {
  for (const isShort of [false, true]) {
    const names = isShort ? MONTHS[language].short : MONTHS[language].full;
    names.forEach((name, index) => {
      const key = stripAccents(name).toLowerCase();
      if (!MONTH_LOOKUP.has(key)) {
        MONTH_LOOKUP.set(key, { month: index + 1, language, isShort });
      }
    });
  }
}

function lookUpMonth(word: string): MonthEntry | undefined {
  return MONTH_LOOKUP.get(stripAccents(word).toLowerCase());
}

type CalendarDate = { year: number; month: number; day: number };

function shiftDate(
  date: CalendarDate,
  offsetDays: number,
): CalendarDate | null {
  const parsed = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (
    parsed.getUTCMonth() !== date.month - 1 ||
    parsed.getUTCDate() !== date.day
  ) {
    return null;
  }
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
  };
}

function matchCase(value: string, source: string): string {
  if (isAllCaps(source) && source.length > 1) return value.toUpperCase();
  const first = source.charAt(0);
  return first === first.toUpperCase()
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : value.toLowerCase();
}

function dayText(
  day: number,
  source: string,
  ordinal: string | undefined,
  language: Language,
): string {
  if (language === "fr" && day === 1) return "1er";
  if (language === "en" && ordinal) {
    const last = day % 10;
    const suffix =
      day >= 11 && day <= 13
        ? "th"
        : last === 1
          ? "st"
          : last === 2
            ? "nd"
            : last === 3
              ? "rd"
              : "th";
    return `${day}${suffix}`;
  }
  return source.startsWith("0") ? String(day).padStart(2, "0") : String(day);
}

function monthText(month: number, entry: MonthEntry, source: string): string {
  const names = MONTHS[entry.language];
  return matchCase(
    (entry.isShort ? names.short : names.full)[month - 1],
    source,
  );
}

const BEFORE_DATE = "(?<![\\p{L}\\p{N}/.,-])";
const AFTER_DATE = "(?![\\p{L}\\p{N}/-]|\\.\\p{N})";

const DAY_MONTH_YEAR = new RegExp(
  `${BEFORE_DATE}(\\d{1,2})(er|ère|st|nd|rd|th)?(\\s+)(\\p{L}+)(\\.?)([\\s,]+)(\\d{4})${AFTER_DATE}`,
  "giu",
);
const MONTH_DAY_YEAR = new RegExp(
  `(?<![\\p{L}])(\\p{L}+)(\\.?)(\\s+)(\\d{1,2})(st|nd|rd|th)?(,?\\s+)(\\d{4})${AFTER_DATE}`,
  "giu",
);
// Numeric dates are read day first, as in French and Cameroonian usage.
const NUMERIC_DAY_FIRST = new RegExp(
  `${BEFORE_DATE}(\\d{1,2})([/.-])(\\d{1,2})\\2(\\d{4}|\\d{2})${AFTER_DATE}`,
  "gu",
);
const NUMERIC_ISO = new RegExp(
  `${BEFORE_DATE}(\\d{4})([/-])(\\d{1,2})\\2(\\d{1,2})${AFTER_DATE}`,
  "gu",
);

function shiftDates(
  input: string,
  offsetDays: number,
  put: (value: string) => string,
  addResidual: (kind: ResidualKind, text: string) => void,
): { text: string; count: number } {
  let count = 0;
  const done = (value: string) => {
    count += 1;
    return put(value);
  };

  let text = input.replace(
    DAY_MONTH_YEAR,
    (match, day, ordinal, gap1, word, dot, gap2, year) => {
      const entry = lookUpMonth(word);
      if (!entry) return match;
      const shifted = shiftDate(
        { year: Number(year), month: entry.month, day: Number(day) },
        offsetDays,
      );
      if (!shifted) {
        addResidual("unreadable-date", match);
        return match;
      }
      return done(
        dayText(shifted.day, day, ordinal, entry.language) +
          gap1 +
          monthText(shifted.month, entry, word) +
          dot +
          gap2 +
          shifted.year,
      );
    },
  );

  text = text.replace(
    MONTH_DAY_YEAR,
    (match, word, dot, gap1, day, ordinal, gap2, year) => {
      const entry = lookUpMonth(word);
      if (!entry) return match;
      const shifted = shiftDate(
        { year: Number(year), month: entry.month, day: Number(day) },
        offsetDays,
      );
      if (!shifted) {
        addResidual("unreadable-date", match);
        return match;
      }
      return done(
        monthText(shifted.month, entry, word) +
          dot +
          gap1 +
          dayText(shifted.day, day, ordinal, "en") +
          gap2 +
          shifted.year,
      );
    },
  );

  text = text.replace(
    NUMERIC_DAY_FIRST,
    (match, day, separator, month, year) => {
      // "14.3.20" with dots and a short year is a clause number.
      if (separator === "." && year.length === 2) return match;
      const fullYear =
        year.length === 4
          ? Number(year)
          : Number(year) + (Number(year) < 70 ? 2000 : 1900);
      const shifted = shiftDate(
        { year: fullYear, month: Number(month), day: Number(day) },
        offsetDays,
      );
      if (!shifted) {
        addResidual("unreadable-date", match);
        return match;
      }
      const pad = (value: number, source: string) =>
        source.length === 2 ? String(value).padStart(2, "0") : String(value);
      const yearText =
        year.length === 4
          ? String(shifted.year)
          : String(shifted.year % 100).padStart(2, "0");
      return done(
        [pad(shifted.day, day), pad(shifted.month, month), yearText].join(
          separator,
        ),
      );
    },
  );

  text = text.replace(NUMERIC_ISO, (match, year, separator, month, day) => {
    const shifted = shiftDate(
      { year: Number(year), month: Number(month), day: Number(day) },
      offsetDays,
    );
    if (!shifted) {
      addResidual("unreadable-date", match);
      return match;
    }
    return done(
      [
        String(shifted.year),
        String(shifted.month).padStart(2, "0"),
        String(shifted.day).padStart(2, "0"),
      ].join(separator),
    );
  });

  return { text, count };
}

const FULL_MONTHS =
  "janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre|january|february|march|april|may|june|july|august|september|october|november|december";
const MONEY_WORDS =
  "FCFA|F\\s?CFA|XAF|EUR|USD|GBP|francs?|euros?|dollars?|€|\\$|£";
const DIGIT_GROUP = "\\d[\\d\\s.,\\u00A0\\u202F]*";

// Run in this order. Each match is blanked out, so it is reported only once.
const RESIDUAL_CHECKS: [ResidualKind, RegExp][] = [
  ["contact", /[\w.+-]+@[\w-]+\.[\w.-]+/gu],
  ["contact", /(?<![\p{L}])(?:B\.?P\.?|P\.?O\.?\s*Box)\s*:?\s*\d+/giu],
  ["contact", /\+\d{2,3}[\s.\-\d]{7,}\d/gu],
  ["contact", /(?<!\p{N})6\d{2}(?:[\s.-]?\d{2}){3}(?!\p{N})/gu],
  [
    "reference",
    /(?<![\p{L}])(?:n°|nº|no\.|réf\.?|ref\.?)\s*:?\s*[^\s,;]*\d[^\s,;]*/giu,
  ],
  [
    "amount",
    new RegExp(`${DIGIT_GROUP}\\s?(?:${MONEY_WORDS})(?![\\p{L}])`, "giu"),
  ],
  [
    "amount",
    new RegExp(
      `(?:FCFA|XAF|EUR|USD|GBP|€|\\$|£)\\s?\\d[\\d\\s.,\\u00A0\\u202F]*\\d`,
      "giu",
    ),
  ],
  [
    "amount",
    /(?<![\p{L}])(?:mille|millions?|milliards?|thousand|billions?)(?![\p{L}])/giu,
  ],
  ["amount", /(?<![\p{L}\p{N}.,])\d{1,3}(?:[\s  .]\d{3})+(?![\p{L}\p{N}])/gu],
  // "du 3 au 5 mars 2024": the 5 was shifted, so the 3 would give the real date away.
  ["partial-date", /\d{1,2}(?:er)?\s+(?:au|à|et|to|and)\s+(?=)/giu],
  [
    "partial-date",
    new RegExp(
      `(?<![\\p{L}])(?:${FULL_MONTHS})\\s+(?:de\\s+)?(?:19|20)\\d{2}(?!\\p{N})`,
      "giu",
    ),
  ],
  ["year", /(?<![\p{L}\p{N}/.-])(?:19|20)\d{2}(?![\p{L}\p{N}])/gu],
];

export function anonymiseText(
  input: string,
  names: NameMap,
  offsetDays: number,
): AnonymiseResult {
  if (RESERVED_CHARACTERS.test(input)) {
    throw new Error("The input uses reserved private-use characters.");
  }

  const placeholders = createPlaceholders();
  const put = (value: string) => placeholders.put(value);

  const residualCounts = new Map<string, Residual>();
  const addResidual = (kind: ResidualKind, raw: string) => {
    const text = placeholders.resolve(raw).replace(/\s+/gu, " ").trim();
    const key = `${kind}:${text}`;
    const existing = residualCounts.get(key);
    if (existing) existing.count += 1;
    else residualCounts.set(key, { kind, text, count: 1 });
  };

  const normalised = input.normalize("NFC");
  const afterNames = replaceNames(normalised, names, put);
  const afterDates = shiftDates(afterNames.text, offsetDays, put, addResidual);

  let working = afterDates.text;
  for (const [kind, regex] of RESIDUAL_CHECKS) {
    working = working.replace(regex, (match) => {
      addResidual(kind, match);
      return " ".repeat(match.length);
    });
  }

  return {
    text: placeholders.resolve(afterDates.text),
    namesReplaced: afterNames.count,
    datesShifted: afterDates.count,
    residuals: [...residualCounts.values()],
  };
}

/** Rejects a map that is empty, or whose replacement values still contain a real name. */
export function validateNameMap(names: NameMap): string | null {
  const entries = Object.entries(names);
  if (entries.length === 0) return "The name map is empty.";
  for (const [real, replacement] of entries) {
    if (!real.trim() || !replacement.trim()) {
      return "The name map has an empty name or replacement.";
    }
    if (containsName(replacement, names)) {
      return `The replacement for "${real}" still contains a real name.`;
    }
  }
  return null;
}
