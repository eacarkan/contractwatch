"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import {
  createContract,
  type CreateContractState,
} from "@/app/[locale]/contracts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ContractType } from "@/lib/generated/prisma/enums";

const INITIAL_STATE: CreateContractState = { error: null };

export function NewContractForm() {
  const t = useTranslations("Contracts");
  const contractTypes = useTranslations("ContractType");
  const languages = useTranslations("Language");
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    createContract,
    INITIAL_STATE,
  );

  return (
    <form action={action} className="grid gap-4">
      <h2 className="font-heading text-xl font-semibold">{t("form.title")}</h2>

      <div className="grid gap-1.5">
        <Label htmlFor="name">{t("form.name")}</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={200}
          aria-invalid={state.error === "name"}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="type">{t("form.type")}</Label>
        <NativeSelect
          id="type"
          name="type"
          defaultValue={ContractType.CCAG_TRAVAUX}
          className="w-full"
        >
          {Object.values(ContractType).map((type) => (
            <NativeSelectOption key={type} value={type}>
              {contractTypes(type)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="language">{t("form.language")}</Label>
        <NativeSelect
          id="language"
          name="language"
          defaultValue={locale}
          className="w-full"
        >
          <NativeSelectOption value="fr">{languages("fr")}</NativeSelectOption>
          <NativeSelectOption value="en">{languages("en")}</NativeSelectOption>
        </NativeSelect>
      </div>

      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? t("form.submitting") : t("form.submit")}
      </Button>
    </form>
  );
}
