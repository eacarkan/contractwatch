import { getTranslations, setRequestLocale } from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { safeReturnPath } from "@/lib/demo-gate";

import { enter } from "./actions";

export default async function EnterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("Enter");
  const fallback = `/${locale}/contracts`;

  return (
    <section className="border-border mx-auto grid max-w-md gap-3 rounded-lg border bg-white p-6">
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm">{t("help")}</p>
      <ActionForm action={enter.bind(null, fallback)} submit={t("submit")}>
        <input
          type="hidden"
          name="next"
          value={safeReturnPath(next, fallback)}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="password">{t("password")}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
      </ActionForm>
    </section>
  );
}
