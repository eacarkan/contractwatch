"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useTranslations("Error");

  return (
    <>
      <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground mt-2">{t("body")}</p>
      <Button className="mt-4" onClick={reset}>
        {t("retry")}
      </Button>
    </>
  );
}
