"use client";

import { useLocale } from "next-intl";

import { Link, usePathname } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";

const LANGUAGE_NAMES: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  fr: "Français",
};

export function LocaleSwitcher() {
  const current = useLocale();
  const pathname = usePathname();

  return (
    <div className="flex gap-3 text-sm">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          lang={locale}
          aria-current={locale === current ? "true" : undefined}
          className="text-muted-foreground aria-[current=true]:text-foreground underline-offset-4 hover:underline aria-[current=true]:font-semibold"
        >
          {LANGUAGE_NAMES[locale]}
        </Link>
      ))}
    </div>
  );
}
