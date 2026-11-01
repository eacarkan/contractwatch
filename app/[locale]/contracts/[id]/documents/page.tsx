import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { UploadForm } from "@/components/upload-form";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usesVercelBlob } from "@/lib/blob";
import { prisma } from "@/lib/db";
import type { TextStatus } from "@/lib/generated/prisma/enums";
import { Link } from "@/lib/i18n/navigation";
import {
  countNumberedClauses,
  countWords,
  findFallbackReasons,
  PREAMBLE_REF,
} from "@/lib/text/split-clauses";

const EXCERPT_LENGTH = 110;

const STATUS_STYLES: Record<TextStatus, string> = {
  PENDING: "bg-secondary text-secondary-foreground",
  EXTRACTED: "bg-settled text-white",
  NEEDS_OCR: "bg-signal text-foreground",
  FAILED: "bg-destructive text-white",
};

function pageRange(from: number | null, to: number | null): string {
  if (from === null) return "";
  return from === to ? String(from) : `${from}–${to}`;
}

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: { createdAt: "desc" },
        include: { clauses: { orderBy: { orderIndex: "asc" } } },
      },
    },
  });
  if (!contract) notFound();

  const t = await getTranslations("Documents");
  const kinds = await getTranslations("DocKind");
  const statuses = await getTranslations("TextStatus");
  const contractTypes = await getTranslations("ContractType");

  return (
    <div className="grid grid-cols-1 gap-8">
      <header>
        <Link
          href="/contracts"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          {t("back")}
        </Link>
        <h1 className="font-heading mt-1 text-3xl font-semibold">
          {contract.name}
        </h1>
        <p className="text-muted-foreground">{contractTypes(contract.type)}</p>
      </header>

      <UploadForm
        contractId={contract.id}
        storage={usesVercelBlob() ? "blob" : "local"}
      />

      <section className="grid grid-cols-1 gap-4">
        <h2 className="font-heading text-2xl font-semibold">
          {t("list.title")}
        </h2>

        {contract.documents.length === 0 && (
          <p className="text-muted-foreground">{t("list.empty")}</p>
        )}

        {contract.documents.map((document, index) => {
          const fallbackReasons =
            document.textStatus === "EXTRACTED"
              ? findFallbackReasons(document.clauses)
              : [];

          return (
            <article
              key={document.id}
              className="border-border rounded-lg border bg-white p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="min-w-0 font-medium break-words">
                  {document.filename}
                </h3>
                <Badge className={STATUS_STYLES[document.textStatus]}>
                  {statuses(document.textStatus)}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                {kinds(document.kind)}
                {document.textStatus === "EXTRACTED" && (
                  <>
                    {". "}
                    {t("list.summary", {
                      pages: document.pageCount ?? 0,
                      clauses: countNumberedClauses(document.clauses),
                    })}
                  </>
                )}
              </p>

              {document.textStatus === "NEEDS_OCR" && (
                <p className="border-signal mt-3 border-l-4 pl-2 text-sm">
                  {t("needsOcr")}
                </p>
              )}
              {document.textStatus === "FAILED" && (
                <p className="border-destructive mt-3 border-l-4 pl-2 text-sm">
                  {t("failed")}
                </p>
              )}
              {fallbackReasons.map((reason) => (
                <p
                  key={
                    reason.code === "clause-too-long"
                      ? reason.clauseRef
                      : reason.code
                  }
                  className="border-signal mt-3 border-l-4 pl-2 text-sm"
                >
                  {reason.code === "too-few-clauses"
                    ? t("fallback.tooFewClauses", { clauses: reason.clauses })
                    : t("fallback.clauseTooLong", {
                        clauseRef: reason.clauseRef,
                        words: reason.words,
                      })}
                </p>
              ))}

              {document.clauses.length > 0 && (
                <details className="mt-3" open={index === 0}>
                  <summary className="cursor-pointer text-sm font-medium">
                    {t("clauses.toggle")}
                  </summary>
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">
                          {t("clauses.columns.ref")}
                        </TableHead>
                        <TableHead>{t("clauses.columns.heading")}</TableHead>
                        <TableHead className="text-right">
                          {t("clauses.columns.pages")}
                        </TableHead>
                        <TableHead className="text-right">
                          {t("clauses.columns.words")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {document.clauses.map((clause) => (
                        <TableRow key={clause.id} className="align-top">
                          <TableCell className="font-heading text-base font-semibold tabular-nums">
                            {clause.clauseRef === PREAMBLE_REF
                              ? "–"
                              : clause.clauseRef}
                          </TableCell>
                          <TableCell
                            className="whitespace-normal"
                            lang={contract.language}
                          >
                            <span className="font-medium">
                              {clause.clauseRef === PREAMBLE_REF
                                ? t("clauses.preamble")
                                : clause.heading}
                            </span>
                            {clause.body && (
                              <span className="text-muted-foreground block text-xs">
                                {clause.body.slice(0, EXCERPT_LENGTH)}
                                {clause.body.length > EXCERPT_LENGTH && "…"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {pageRange(clause.pageFrom, clause.pageTo)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {countWords(clause.body)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
