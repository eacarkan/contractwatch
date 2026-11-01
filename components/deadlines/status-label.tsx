import { getTranslations } from "next-intl/server";

import type { DeadlineView } from "@/lib/deadline";

const TONES: Record<DeadlineView, string> = {
  OPEN: "border-input",
  OVERDUE: "border-destructive text-destructive font-medium",
  MET: "border-emerald-700 text-emerald-800",
  WAIVED: "border-input text-muted-foreground",
  NOT_APPLICABLE: "border-input text-muted-foreground",
};

export async function StatusLabel({ view }: { view: DeadlineView }) {
  const t = await getTranslations("DeadlineStatus");
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-xs ${TONES[view]}`}
    >
      {t(view)}
    </span>
  );
}
