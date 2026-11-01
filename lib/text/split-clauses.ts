/**
 * Regex clause splitter from section 4.2 of the build plan.
 *
 * The plan's pattern matches any line that starts with a number, so on real
 * contract text it also matches wrapped sentences ("30 jours à compter de…"),
 * amounts, dates and contents pages. It stays the base here, with the additions
 * marked below, and a numbering check decides which matches are real clauses.
 */

export type SourcePage = { page: number | null; text: string };

export type SplitClause = {
  clauseRef: string;
  heading: string | null;
  body: string;
  pageFrom: number | null;
  pageTo: number | null;
  orderIndex: number;
};

export type RejectReason =
  | "contents-line"
  | "cross-reference"
  | "number-in-text"
  | "date"
  | "implausible-number"
  | "list-item"
  | "out-of-sequence";

export type RejectedLine = {
  page: number | null;
  line: string;
  reason: RejectReason;
};

export type SplitResult = {
  clauses: SplitClause[];
  rejected: RejectedLine[];
  /** Lines removed as running headers, footers or page numbers. */
  furniture: string[];
  /** Why section 4.2's LLM fallback would apply; empty when it would not. */
  fallbackReasons: FallbackReason[];
};

export type FallbackReason =
  | { code: "too-few-clauses"; clauses: number }
  | { code: "clause-too-long"; clauseRef: string; words: number };

/** Text before the first clause is kept, so nothing is lost silently. */
export const PREAMBLE_REF = "preamble";

const HEADING_CAP = 120;
const FALLBACK_MIN_CLAUSES = 10;
const FALLBACK_MAX_WORDS = 3000;
const MAX_TOP_LEVEL_NUMBER = 200;
const MAX_SUB_LEVEL_NUMBER = 99;

// Section 4.2: ^(Article|Art\.|Clause|Sub-Clause)?\s*(\d+(\.\d+)*)[\s.:—-]+(.+)$
// Additions: case-insensitive ("ARTICLE 14"); "1er" and "premier"; bis, ter and
// quater; en dash and the other hyphens; and optional heading text, for
// "Article 14" with its heading on the next line.
const CLAUSE_LINE =
  /^(Article|Art\.?|Clause|Sub-Clause)?\s*(1\s?er\b|premier\b|\d+(?:\.\d+)*)(?:\s+(bis|ter|quater)\b)?([\s.:‐-―-]*)(.*)$/iu;

const EXPLICIT_SEPARATOR = /[.:‐-―-]/u;
const DOT_LEADER = /\.{3,}|…|(?:\.\s){3,}/u;
const TRAILING_PAGE_NUMBER = /\s\d{1,3}$/u;
const MONTH_FIRST =
  /^(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre|january|february|march|april|may|june|july|august|september|october|november|december)(?!\p{L})/iu;
// A line ending on one of these is a sentence that carries on, not a heading.
const CONTINUATION_END =
  /(?<!\p{L})(?:de|du|des|la|le|les|à|au|aux|et|ou|par|pour|dans|sur|en|un|une|que|qui|the|of|to|and|or|in|for|by|with|a|an)$|[dlqjnst]['’]$/iu;
const LONE_PAGE_NUMBER =
  /^[\s‐-―-]*(?:page\s*)?\d{1,4}(?:\s*(?:\/|sur|of)\s*\d{1,4})?[\s‐-―-]*$/iu;

type Line = { text: string; page: number | null };

type Candidate = {
  lineIndex: number;
  kind: "article" | "clause" | "bare";
  path: number[];
  clauseRef: string;
  rest: string;
};

/** Sorts bis, ter and quater after an article's sub-clauses and before the next article. */
const SUFFIX_RANK: Record<string, number> = {
  bis: 9002,
  ter: 9003,
  quater: 9004,
};

function parseNumber(raw: string): number[] {
  return /^(?:1\s?er|premier)$/iu.test(raw)
    ? [1]
    : raw.split(".").map((part) => Number.parseInt(part, 10));
}

function hasImplausibleNumber(raw: string, path: number[]): boolean {
  return (
    path[0] > MAX_TOP_LEVEL_NUMBER ||
    path.slice(1).some((part) => part > MAX_SUB_LEVEL_NUMBER) ||
    /(?:^|\.)0\d/u.test(raw)
  );
}

function parseCandidate(
  text: string,
  lineIndex: number,
): Candidate | RejectReason | null {
  const match = CLAUSE_LINE.exec(text);
  if (!match) return null;

  const [, prefix, rawNumber, suffix, separator, rest] = match;
  const isOrdinal = /^(?:1\s?er|premier)$/iu.test(rawNumber);
  if (!prefix && isOrdinal) return null;
  // "14e alinéa": a number glued to a word is not a clause number.
  if (rest && !separator) return null;

  const path = parseNumber(rawNumber);
  const isTopLevelBare = !prefix && path.length === 1;
  // A bare "12" on its own line is a page number.
  if (isTopLevelBare && !rest) return null;

  if (hasImplausibleNumber(rawNumber, path)) return "implausible-number";
  if (DOT_LEADER.test(rest)) return "contents-line";

  const explicit = EXPLICIT_SEPARATOR.test(separator);
  const startsLower = /^\p{Ll}/u.test(rest);

  if (prefix) {
    // "Article 14 du présent cahier" or "Clause 14 [Payment]".
    if (rest && !explicit && (startsLower || /^[([]/u.test(rest))) {
      return "cross-reference";
    }
  } else if (rest) {
    // "30 jours", "100 000 FCFA", "15 % du montant".
    if (!/^\p{L}/u.test(rest) || (!explicit && startsLower)) {
      return "number-in-text";
    }
    if (MONTH_FIRST.test(rest)) return "date";
  }

  const number = isOrdinal ? "1" : rawNumber;
  const label = suffix ? `${number} ${suffix.toLowerCase()}` : number;
  const isArticle = prefix ? /^art/iu.test(prefix) : false;

  return {
    lineIndex,
    kind: isArticle ? "article" : prefix ? "clause" : "bare",
    path: suffix ? [...path, SUFFIX_RANK[suffix.toLowerCase()]] : path,
    clauseRef: isArticle ? `Art. ${label}` : label,
    rest: rest.trim(),
  };
}

function looksLikeHeading(text: string, next: string | undefined): boolean {
  return (
    text.length > 0 &&
    text.length <= HEADING_CAP &&
    !/[.,;:]$/u.test(text) &&
    !CONTINUATION_END.test(text) &&
    !(next && /^\p{Ll}/u.test(next))
  );
}

function comparePaths(a: number[], b: number[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

/**
 * Keeps the heaviest chain of strictly increasing clause numbers. One wrong match
 * cannot derail the rest, because a chain through it is shorter than the true one.
 * Likely headings weigh more than sentences, and among equal chains the latest
 * start wins, which picks the body over a contents page.
 */
function longestNumberedChain(
  candidates: Candidate[],
  lines: Line[],
): Set<Candidate> {
  const weights = candidates.map((candidate) => {
    const standsAlone = candidate.kind !== "bare" && !candidate.rest;
    return standsAlone ||
      looksLikeHeading(candidate.rest, lines[candidate.lineIndex + 1]?.text)
      ? 2
      : 1;
  });
  const best = new Array<number>(candidates.length).fill(0);
  const next = new Array<number>(candidates.length).fill(-1);

  for (let i = candidates.length - 1; i >= 0; i--) {
    best[i] = weights[i];
    for (let j = i + 1; j < candidates.length; j++) {
      if (
        comparePaths(candidates[j].path, candidates[i].path) > 0 &&
        weights[i] + best[j] > best[i]
      ) {
        best[i] = weights[i] + best[j];
        next[i] = j;
      }
    }
  }

  let start = -1;
  best.forEach((score, index) => {
    if (start < 0 || score >= best[start]) start = index;
  });

  const chain = new Set<Candidate>();
  for (let index = start; index >= 0; index = next[index]) {
    chain.add(candidates[index]);
  }
  return chain;
}

/** A contents page without dot leaders: consecutive matches ending in page numbers. */
function findContentsBlocks(candidates: Candidate[]): Set<Candidate> {
  const contents = new Set<Candidate>();
  let runStart = 0;
  for (let index = 1; index <= candidates.length; index++) {
    const adjacent =
      index < candidates.length &&
      candidates[index].lineIndex === candidates[index - 1].lineIndex + 1;
    if (adjacent) continue;
    const run = candidates.slice(runStart, index);
    const withPageNumbers = run.filter((candidate) =>
      TRAILING_PAGE_NUMBER.test(candidate.rest),
    );
    // The first real clause can sit right after the block, so only the lines
    // that end in a page number are treated as contents.
    if (run.length >= 5 && withPageNumbers.length >= run.length * 0.8) {
      withPageNumbers.forEach((candidate) => contents.add(candidate));
    }
    runStart = index;
  }
  return contents;
}

/**
 * Removes running headers, footers and page numbers: lines at the top or bottom
 * of a page that repeat across most pages once their digits are ignored.
 */
function stripPageFurniture(pages: SourcePage[]): {
  pages: SourcePage[];
  furniture: string[];
} {
  const splitPages = pages.map((page) =>
    page.text.split("\n").map((line) => line.trim()),
  );

  const edgeIndexes = (lines: string[]) => {
    const filled = lines.flatMap((line, index) => (line ? [index] : []));
    return new Set([...filled.slice(0, 2), ...filled.slice(-2)]);
  };
  const normalise = (line: string) => line.replace(/\d+/gu, "#").toLowerCase();

  const counts = new Map<string, number>();
  for (const lines of splitPages) {
    const seen = new Set<string>();
    for (const index of edgeIndexes(lines)) {
      const line = lines[index];
      // Never treat something that could be a clause heading as furniture.
      if (CLAUSE_LINE.exec(line)?.[1]) continue;
      seen.add(normalise(line));
    }
    seen.forEach((line) => counts.set(line, (counts.get(line) ?? 0) + 1));
  }

  const minimumPages = Math.max(3, Math.ceil(pages.length / 2));
  const furniture = new Set<string>();

  const cleaned = splitPages.map((lines, pageIndex) => {
    const edges = edgeIndexes(lines);
    const kept = lines.filter((line, index) => {
      if (!edges.has(index)) return true;
      const repeated =
        pages.length >= 3 && (counts.get(normalise(line)) ?? 0) >= minimumPages;
      const isPageNumber =
        pages[pageIndex].page !== null && LONE_PAGE_NUMBER.test(line);
      if (repeated || isPageNumber) {
        furniture.add(line);
        return false;
      }
      return true;
    });
    return { page: pages[pageIndex].page, text: kept.join("\n") };
  });

  return { pages: cleaned, furniture: [...furniture] };
}

export function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

export function countNumberedClauses(clauses: { clauseRef: string }[]): number {
  return clauses.filter((clause) => clause.clauseRef !== PREAMBLE_REF).length;
}

/** Applies section 4.2's fallback conditions to a finished clause list. */
export function findFallbackReasons(
  clauses: { clauseRef: string; body: string }[],
): FallbackReason[] {
  const reasons: FallbackReason[] = [];
  const numbered = countNumberedClauses(clauses);
  if (numbered < FALLBACK_MIN_CLAUSES) {
    reasons.push({ code: "too-few-clauses", clauses: numbered });
  }
  for (const clause of clauses) {
    const words = countWords(clause.body);
    if (words > FALLBACK_MAX_WORDS) {
      reasons.push({
        code: "clause-too-long",
        clauseRef: clause.clauseRef,
        words,
      });
    }
  }
  return reasons;
}

export function splitClauses(sourcePages: SourcePage[]): SplitResult {
  const { pages, furniture } = stripPageFurniture(sourcePages);

  // Blank lines are dropped so they cannot separate a line from the one it wraps
  // onto. Each DOCX paragraph and PDF text line stays on its own line in the body.
  const lines: Line[] = pages
    .flatMap((page) =>
      page.text
        .split("\n")
        .map((text) => ({ text: text.trim(), page: page.page })),
    )
    .filter((line) => line.text);

  const rejections: { lineIndex: number; reason: RejectReason }[] = [];
  const reject = (lineIndex: number, reason: RejectReason) =>
    rejections.push({ lineIndex, reason });

  let candidates: Candidate[] = [];
  lines.forEach((line, lineIndex) => {
    const parsed = parseCandidate(line.text, lineIndex);
    if (parsed === null) return;
    if (typeof parsed === "string") reject(lineIndex, parsed);
    else candidates.push(parsed);
  });

  const contents = findContentsBlocks(candidates);
  contents.forEach((candidate) => reject(candidate.lineIndex, "contents-line"));
  candidates = candidates.filter((candidate) => !contents.has(candidate));

  // When a document numbers its clauses "Article 14", a bare "2." is a list item.
  const usesPrefixes =
    candidates.filter((c) => c.kind !== "bare" && c.path.length === 1).length >=
    3;
  if (usesPrefixes) {
    candidates = candidates.filter((candidate) => {
      const isListItem =
        candidate.kind === "bare" && candidate.path.length === 1;
      if (isListItem) reject(candidate.lineIndex, "list-item");
      return !isListItem;
    });
  }

  const chain = longestNumberedChain(candidates, lines);
  candidates.forEach((candidate) => {
    if (!chain.has(candidate)) reject(candidate.lineIndex, "out-of-sequence");
  });

  const accepted = [...chain].sort((a, b) => a.lineIndex - b.lineIndex);
  const clauses: SplitClause[] = [];

  const addClause = (
    clauseRef: string,
    heading: string | null,
    bodyLines: Line[],
    pageFrom: number | null,
  ) => {
    const lastLine = bodyLines.at(-1);
    clauses.push({
      clauseRef,
      heading,
      body: bodyLines.map((line) => line.text).join("\n"),
      pageFrom,
      pageTo: lastLine ? lastLine.page : pageFrom,
      orderIndex: clauses.length,
    });
  };

  const firstClauseLine = accepted[0]?.lineIndex ?? lines.length;
  if (firstClauseLine > 0) {
    addClause(
      PREAMBLE_REF,
      null,
      lines.slice(0, firstClauseLine),
      lines[0].page,
    );
  }

  accepted.forEach((candidate, position) => {
    const end = accepted[position + 1]?.lineIndex ?? lines.length;
    let bodyStart = candidate.lineIndex + 1;
    let heading: string | null = null;
    const bodyLines: Line[] = [];
    const page = lines[candidate.lineIndex].page;

    if (candidate.rest) {
      if (looksLikeHeading(candidate.rest, lines[bodyStart]?.text)) {
        heading = candidate.rest;
      } else {
        bodyLines.push({ text: candidate.rest, page });
      }
    } else if (
      bodyStart < end &&
      looksLikeHeading(lines[bodyStart].text, lines[bodyStart + 1]?.text)
    ) {
      // "Article 14" alone, with its heading on the next line.
      heading = lines[bodyStart].text;
      bodyStart += 1;
    }

    bodyLines.push(...lines.slice(bodyStart, end));
    addClause(candidate.clauseRef, heading, bodyLines, page);
  });

  return {
    clauses,
    rejected: rejections
      .sort((a, b) => a.lineIndex - b.lineIndex)
      .map(({ lineIndex, reason }) => ({
        page: lines[lineIndex].page,
        line: lines[lineIndex].text,
        reason,
      })),
    furniture,
    fallbackReasons: findFallbackReasons(clauses),
  };
}
