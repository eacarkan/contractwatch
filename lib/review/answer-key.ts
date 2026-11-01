import type { ReviewFile } from "@/lib/review/package";

type Extracted = {
  id: string;
  clauseRef: string;
  obligor: string;
  category: string;
  periodValue: number | null;
  periodBasis: string | null;
  isTimeBar: boolean;
};

type KeyItem = {
  clause_ref: string;
  obligor: string;
  category: string;
  period_value?: number | null;
  period_basis?: string | null;
  is_time_bar: boolean;
};

/**
 * Decides each extracted item from a contract's own answer key, for a synthetic
 * contract whose author wrote the key. An item the key does not hold is rejected,
 * and one that differs from it is corrected to it. Only the first item for each
 * key entry is kept, so a duplicate does not reach the register.
 */
export function decideFromKey(
  extracted: Extracted[],
  key: KeyItem[],
): ReviewFile["decisions"] {
  const open = [...key];

  const take = (test: (item: KeyItem) => boolean) => {
    const index = open.findIndex(test);
    return index < 0 ? null : open.splice(index, 1)[0]!;
  };

  return extracted.map((item): ReviewFile["decisions"][number] => {
    const exact = take(
      (entry) =>
        entry.clause_ref === item.clauseRef &&
        entry.obligor === item.obligor &&
        entry.category === item.category,
    );
    const entry =
      exact ?? take((candidate) => candidate.clause_ref === item.clauseRef);
    if (!entry) {
      return {
        id: item.id,
        decision: "REJECTED",
        note: "Not in the answer key.",
      };
    }

    const wanted = {
      obligor: entry.obligor,
      category: entry.category,
      periodValue: entry.period_value ?? null,
      periodBasis: entry.period_basis ?? null,
      isTimeBar: entry.is_time_bar,
    };
    const differs = Object.entries(wanted).some(
      ([field, value]) => item[field as keyof Extracted] !== value,
    );
    return differs
      ? {
          id: item.id,
          decision: "EDITED",
          edit: wanted as never,
          note: "Corrected to the answer key.",
        }
      : { id: item.id, decision: "CONFIRMED", note: null };
  });
}
