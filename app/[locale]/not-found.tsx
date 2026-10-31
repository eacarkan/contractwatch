import { useTranslations } from "next-intl";

import { Link } from "@/lib/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <>
      <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground mt-2">{t("body")}</p>
      <Link
        href="/contracts"
        className="mt-4 inline-block underline underline-offset-4"
      >
        {t("back")}
      </Link>
    </>
  );
}
