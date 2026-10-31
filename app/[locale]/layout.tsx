import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DemoBanner } from "@/components/demo-banner";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Link } from "@/lib/i18n/navigation";
import { routing } from "@/lib/i18n/routing";

import "../globals.css";

// Barlow takes its letterforms from highway signs and vehicle plates. It has
// full French diacritics and suits a tool for infrastructure contracts.
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ContractWatch",
  description:
    "Demonstration tool for time-bound obligations in infrastructure and EPC contracts.",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations("Demo");
  const nav = await getTranslations("Nav");

  return (
    <html
      lang={locale}
      className={`${barlow.variable} ${barlowCondensed.variable}`}
    >
      <body className="flex min-h-svh flex-col">
        <NextIntlClientProvider>
          <DemoBanner text={t("banner")} />
          <header className="border-border border-b bg-white">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-6">
              <div className="flex items-baseline gap-6">
                <Link
                  href="/contracts"
                  className="font-heading text-2xl font-semibold"
                >
                  ContractWatch
                </Link>
                <Link
                  href="/contracts"
                  className="text-sm underline-offset-4 hover:underline"
                >
                  {nav("contracts")}
                </Link>
              </div>
              <LocaleSwitcher />
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
            {children}
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
