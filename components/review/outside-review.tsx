"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import {
  importReview,
  type ImportState,
} from "@/app/[locale]/contracts/[id]/review/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: ImportState = { error: null, summary: null };

export function OutsideReview({ contractId }: { contractId: string }) {
  const t = useTranslations("Review.outside");
  const [state, action, pending] = useActionState(
    importReview.bind(null, contractId),
    INITIAL_STATE,
  );

  return (
    <section className="border-border grid gap-3 rounded-lg border bg-white p-4">
      <h2 className="font-heading text-lg font-semibold">{t("title")}</h2>
      <p className="max-w-prose text-sm">{t("help")}</p>
      <Button asChild variant="outline" className="justify-self-start">
        <a href={`/api/contracts/${contractId}/review/package`}>
          {t("download")}
        </a>
      </Button>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="review-file">{t("file")}</Label>
          <Input
            id="review-file"
            name="file"
            type="file"
            accept=".json,application/json"
            required
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending}>
          {t("upload")}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {t("invalid")}
        </p>
      )}
      {state.summary && (
        <p role="status" className="text-sm font-medium">
          {t("result", { ...state.summary })}
        </p>
      )}
    </section>
  );
}
