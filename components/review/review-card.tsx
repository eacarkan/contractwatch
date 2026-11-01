"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  reviewObligation,
  type ReviewActionResult,
} from "@/app/[locale]/contracts/[id]/review/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  DayBasis,
  ObligationCategory,
  PartyRole,
  PeriodDirection,
  TriggerType,
} from "@/lib/generated/prisma/enums";
import { useRouter } from "@/lib/i18n/navigation";
import {
  LOW_CONFIDENCE,
  reviewFlags,
  type ObligationEdit,
} from "@/lib/review/fields";

export type ReviewedObligation = ObligationEdit & {
  id: string;
  confidence: number | null;
  reviewNote: string | null;
  reviewStatus: string;
};

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement && target.matches("input, textarea, select")
  );
}

export function ReviewCard({
  contractId,
  obligation,
  language,
  returnHref,
}: {
  contractId: string;
  obligation: ReviewedObligation;
  language: string;
  returnHref: string;
}) {
  const t = useTranslations("Review");
  const roles = useTranslations("PartyRole");
  const categories = useTranslations("ObligationCategory");
  const triggers = useTranslations("TriggerType");
  const bases = useTranslations("DayBasis");
  const directions = useTranslations("PeriodDirection");
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<ReviewActionResult["error"]>(null);
  const [saving, startSaving] = useTransition();
  const cardRef = useRef<HTMLElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  function decide(
    decision: "CONFIRMED" | "EDITED" | "REJECTED",
    formData = new FormData(),
  ) {
    formData.set("note", noteRef.current?.value ?? "");
    setError(null);
    startSaving(async () => {
      const result = await reviewObligation(
        contractId,
        obligation.id,
        decision,
        formData,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.replace(returnHref);
      router.refresh();
    });
  }

  const decideRef = useRef(decide);
  useEffect(() => {
    decideRef.current = decide;
  });

  useEffect(() => {
    if (saving) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setEditing(false);
        return;
      }
      if (
        editing ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "c") decideRef.current("CONFIRMED");
      if (key === "r") decideRef.current("REJECTED");
      if (key === "e") {
        event.preventDefault();
        setEditing(true);
      }
    }
    window.addEventListener("keydown", onKey);
    cardRef.current?.setAttribute("data-keys-ready", "true");
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, editing]);

  const flags = reviewFlags(obligation.reviewNote);
  const lowConfidence =
    obligation.confidence !== null && obligation.confidence < LOW_CONFIDENCE;
  const period =
    obligation.periodValue === null
      ? t("values.noPeriod")
      : `${obligation.periodValue} ${obligation.periodBasis ? bases(obligation.periodBasis) : ""}, ${directions(obligation.periodDirection)}`;

  const details: [string, string | null][] = [
    [t("fields.obligor"), roles(obligation.obligor)],
    [
      t("fields.counterparty"),
      obligation.counterparty ? roles(obligation.counterparty) : null,
    ],
    [t("fields.category"), categories(obligation.category)],
    [t("fields.triggerType"), triggers(obligation.triggerType)],
    [t("fields.period"), period],
    [
      t("fields.recurrenceDays"),
      obligation.recurrenceDays === null
        ? null
        : String(obligation.recurrenceDays),
    ],
    [
      t("fields.isTimeBar"),
      obligation.isTimeBar ? t("values.yes") : t("values.no"),
    ],
  ];

  return (
    <section
      ref={cardRef}
      className="border-border grid gap-4 rounded-lg border bg-white p-4"
    >
      <div className="grid gap-1">
        <p className="text-muted-foreground text-sm">
          {t("clauseLabel", { ref: obligation.clauseRef })}
        </p>
        <h2
          className="font-heading text-2xl leading-tight font-semibold"
          lang={language}
        >
          {obligation.title}
        </h2>
      </div>

      {(lowConfidence || flags.length > 0) && (
        <ul className="grid gap-1">
          {lowConfidence && (
            <li className="border-signal border-l-4 pl-2 text-sm">
              {t("notes.lowConfidence", {
                confidence: obligation.confidence ?? 0,
              })}
            </li>
          )}
          {flags.map((flag) => (
            <li key={flag} className="border-signal border-l-4 pl-2 text-sm">
              {t.has(`notes.${flag}`) ? t(`notes.${flag}`) : flag}
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <form
          id="edit-obligation"
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            decide("EDITED", new FormData(event.currentTarget));
          }}
        >
          <TextField
            name="title"
            label={t("fields.title")}
            value={obligation.title}
            maxLength={90}
            required
            autoFocus
          />
          <AreaField
            name="description"
            label={t("fields.description")}
            value={obligation.description}
            required
          />
          <TextField
            name="clauseRef"
            label={t("fields.clauseRef")}
            value={obligation.clauseRef}
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              name="obligor"
              label={t("fields.obligor")}
              value={obligation.obligor}
              options={Object.values(PartyRole).map((value) => [
                value,
                roles(value),
              ])}
            />
            <SelectField
              name="counterparty"
              label={t("fields.counterparty")}
              value={obligation.counterparty ?? ""}
              blankLabel={t("values.none")}
              options={Object.values(PartyRole).map((value) => [
                value,
                roles(value),
              ])}
            />
            <SelectField
              name="category"
              label={t("fields.category")}
              value={obligation.category}
              options={Object.values(ObligationCategory).map((value) => [
                value,
                categories(value),
              ])}
            />
            <SelectField
              name="triggerType"
              label={t("fields.triggerType")}
              value={obligation.triggerType}
              options={Object.values(TriggerType).map((value) => [
                value,
                triggers(value),
              ])}
            />
            <TextField
              name="periodValue"
              label={t("fields.periodValue")}
              value={obligation.periodValue?.toString() ?? ""}
              type="number"
              min={0}
            />
            <SelectField
              name="periodBasis"
              label={t("fields.periodBasis")}
              value={obligation.periodBasis ?? ""}
              blankLabel={t("values.none")}
              options={Object.values(DayBasis).map((value) => [
                value,
                bases(value),
              ])}
            />
            <SelectField
              name="periodDirection"
              label={t("fields.periodDirection")}
              value={obligation.periodDirection}
              options={Object.values(PeriodDirection).map((value) => [
                value,
                directions(value),
              ])}
            />
            <TextField
              name="recurrenceDays"
              label={t("fields.recurrenceDays")}
              value={obligation.recurrenceDays?.toString() ?? ""}
              type="number"
              min={1}
            />
          </div>
          <TextField
            name="triggerEvent"
            label={t("fields.triggerEvent")}
            value={obligation.triggerEvent ?? ""}
          />
          <div className="flex items-center gap-2">
            <input
              id="isTimeBar"
              name="isTimeBar"
              type="checkbox"
              defaultChecked={obligation.isTimeBar}
              className="size-4"
            />
            <Label htmlFor="isTimeBar">{t("fields.isTimeBar")}</Label>
          </div>
          <AreaField
            name="consequence"
            label={t("fields.consequence")}
            value={obligation.consequence ?? ""}
          />
          <AreaField
            name="sourceQuote"
            label={t("fields.sourceQuote")}
            value={obligation.sourceQuote}
            maxLength={400}
            required
          />
        </form>
      ) : (
        <>
          <p lang={language}>{obligation.description}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {details.map(
              ([label, value]) =>
                value !== null && (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ),
            )}
            {obligation.triggerEvent && (
              <div className="contents">
                <dt className="text-muted-foreground">
                  {t("fields.triggerEvent")}
                </dt>
                <dd lang={language}>{obligation.triggerEvent}</dd>
              </div>
            )}
            {obligation.consequence && (
              <div className="contents">
                <dt className="text-muted-foreground">
                  {t("fields.consequence")}
                </dt>
                <dd lang={language}>{obligation.consequence}</dd>
              </div>
            )}
          </dl>
        </>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="note">{t("fields.note")}</Label>
        <textarea
          id="note"
          ref={noteRef}
          rows={2}
          maxLength={1000}
          className="border-input rounded-md border bg-transparent px-2.5 py-1.5 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button type="submit" form="edit-obligation" disabled={saving}>
              {t("actions.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              {t("actions.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={saving}
              onClick={() => decide("CONFIRMED")}
            >
              {t("actions.confirm")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditing(true)}
            >
              {t("actions.edit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => decide("REJECTED")}
            >
              {t("actions.reject")}
            </Button>
            <span className="text-muted-foreground text-sm">
              {t("actions.keys")}
            </span>
          </>
        )}
      </div>

      <div aria-live="polite" className="empty:hidden">
        {saving && <p className="text-sm">{t("actions.saving")}</p>}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {t(`errors.${error}`)}
          </p>
        )}
      </div>
    </section>
  );
}

function TextField({
  name,
  label,
  value,
  ...props
}: {
  name: string;
  label: string;
  value: string;
} & Omit<React.ComponentProps<typeof Input>, "name" | "value">) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={value} {...props} />
    </div>
  );
}

function AreaField({
  name,
  label,
  value,
  required,
  maxLength,
}: {
  name: string;
  label: string;
  value: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <textarea
        id={name}
        name={name}
        defaultValue={value}
        required={required}
        maxLength={maxLength}
        rows={3}
        className="border-input rounded-md border bg-transparent px-2.5 py-1.5 text-sm"
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  value,
  options,
  blankLabel,
}: {
  name: string;
  label: string;
  value: string;
  options: [string, string][];
  blankLabel?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <NativeSelect
        id={name}
        name={name}
        defaultValue={value}
        className="w-full"
      >
        {blankLabel && (
          <NativeSelectOption value="">{blankLabel}</NativeSelectOption>
        )}
        {options.map(([option, optionLabel]) => (
          <NativeSelectOption key={option} value={option}>
            {optionLabel}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
