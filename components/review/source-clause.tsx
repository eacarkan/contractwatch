import { useTranslations } from "next-intl";

import { locateQuote } from "@/lib/text/locate-quote";

export function SourceClause({
  clause,
  quote,
  language,
}: {
  clause: {
    clauseRef: string;
    heading: string | null;
    body: string;
    pageFrom: number | null;
    pageTo: number | null;
  } | null;
  quote: string;
  language: string;
}) {
  const t = useTranslations("Review.source");

  if (!clause) {
    return (
      <section className="border-border rounded-lg border bg-white p-4">
        <h2 className="font-heading text-xl font-semibold">{t("title")}</h2>
        <p className="border-signal mt-3 border-l-4 pl-2 text-sm">
          {t("noClause")}
        </p>
      </section>
    );
  }

  const found = locateQuote(clause.body, quote);

  return (
    <section className="border-border rounded-lg border bg-white p-4">
      <h2 className="font-heading text-xl font-semibold">
        {t("clause", { ref: clause.clauseRef })}
      </h2>
      <p className="text-muted-foreground text-sm" lang={language}>
        {clause.heading}
        {clause.heading && clause.pageFrom !== null && ". "}
        {clause.pageFrom !== null &&
          (clause.pageTo === null || clause.pageTo === clause.pageFrom
            ? t("page", { page: clause.pageFrom })
            : t("pages", { from: clause.pageFrom, to: clause.pageTo }))}
      </p>
      {!found && (
        <p className="border-signal mt-3 border-l-4 pl-2 text-sm">
          {t("quoteNotFound")}
        </p>
      )}
      <p className="mt-3 whitespace-pre-wrap" lang={language}>
        {found ? (
          <>
            {clause.body.slice(0, found.start)}
            <mark className="source-quote">
              {clause.body.slice(found.start, found.end)}
            </mark>
            {clause.body.slice(found.end)}
          </>
        ) : (
          clause.body
        )}
      </p>
    </section>
  );
}
