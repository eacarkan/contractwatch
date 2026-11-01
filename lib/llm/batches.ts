export const MAX_CLAUSES_PER_BATCH = 6;
export const MAX_CHARACTERS_PER_BATCH = 12_000;

/** A clause longer than the character limit is never cut: it goes in a batch of its own. */
export function nextBatch<T extends { body: string }>(clauses: T[]): T[] {
  const batch: T[] = [];
  let characters = 0;

  for (const clause of clauses) {
    const tooLong =
      batch.length > 0 &&
      characters + clause.body.length > MAX_CHARACTERS_PER_BATCH;
    if (batch.length === MAX_CLAUSES_PER_BATCH || tooLong) break;
    batch.push(clause);
    characters += clause.body.length;
  }

  return batch;
}
