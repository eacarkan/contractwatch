"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { SuggestResult } from "@/lib/llm/match";

/** Suggestions stay on screen only; each becomes a link when someone confirms it. */
export function LinkSuggestions({
  request,
  confirm,
}: {
  request: () => Promise<SuggestResult>;
  confirm: (obligationId: string, relation: string) => Promise<void>;
}) {
  const t = useTranslations("Correspondence.suggest");
  const relations = useTranslations("CorrRelation");
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        className="justify-self-start"
        onClick={() => startTransition(async () => setResult(await request()))}
      >
        {pending ? t("working") : t("button")}
      </Button>

      {result && !result.ok && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${result.error}`)}
        </p>
      )}
      {result?.ok && (
        <div className="grid gap-2 text-sm">
          <p>{result.summary}</p>
          {result.suggestions.length === 0 && <p>{t("none")}</p>}
          <ul className="grid gap-2">
            {result.suggestions.map((suggestion) => (
              <li
                key={suggestion.obligation_id}
                className="border-border grid gap-1 rounded-md border p-2"
              >
                <p className="font-medium">
                  {suggestion.clauseRef} {suggestion.title}
                </p>
                <p className="text-muted-foreground">
                  {relations(suggestion.relation)}: {suggestion.reason}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  disabled={
                    pending || confirmed.includes(suggestion.obligation_id)
                  }
                  onClick={() =>
                    startTransition(async () => {
                      await confirm(
                        suggestion.obligation_id,
                        suggestion.relation,
                      );
                      setConfirmed((ids) => [...ids, suggestion.obligation_id]);
                    })
                  }
                >
                  {confirmed.includes(suggestion.obligation_id)
                    ? t("confirmed")
                    : t("confirm")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
