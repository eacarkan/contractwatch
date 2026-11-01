import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ContractHeader } from "@/components/contract-header";
import { OutsideReview } from "@/components/review/outside-review";
import { ReviewCard } from "@/components/review/review-card";
import { SourceClause } from "@/components/review/source-clause";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { Link } from "@/lib/i18n/navigation";
import { CURRENT_PROMPT } from "@/lib/llm/prompts";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ obligation?: string }>;
}) {
  const { locale, id } = await params;
  const { obligation: requestedId } = await searchParams;
  setRequestLocale(locale);

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) notFound();

  const t = await getTranslations("Review");

  // Older prompts' unreviewed items are set aside, or a rerun would ask for the
  // same obligation to be reviewed twice.
  const pending: Prisma.ObligationWhereInput = {
    contractId: id,
    reviewStatus: "PENDING",
    OR: [{ runId: null }, { run: { promptVersion: CURRENT_PROMPT.version } }],
  };
  const reviewedWhere: Prisma.ObligationWhereInput = {
    contractId: id,
    reviewStatus: { not: "PENDING" },
  };

  const [pendingCount, reviewedCount, obligation] = await Promise.all([
    prisma.obligation.count({ where: pending }),
    prisma.obligation.count({ where: reviewedWhere }),
    prisma.obligation.findFirst({
      where: requestedId ? { id: requestedId, contractId: id } : pending,
      orderBy: [{ clause: { orderIndex: "asc" } }, { createdAt: "asc" }],
      include: { clause: true },
    }),
  ]);
  if (requestedId && !obligation) notFound();

  return (
    <div className="grid grid-cols-1 gap-6">
      <ContractHeader contract={contract} active="review" />

      <p className="font-medium" role="status">
        {t("progress", {
          reviewed: reviewedCount,
          total: reviewedCount + pendingCount,
        })}
      </p>

      {obligation ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <ReviewCard
            key={`${obligation.id}-${obligation.reviewedAt?.getTime() ?? 0}`}
            contractId={contract.id}
            language={contract.language}
            returnHref={`/contracts/${contract.id}/${requestedId ? "register" : "review"}`}
            obligation={{
              id: obligation.id,
              clauseRef: obligation.clauseRef,
              obligor: obligation.obligor,
              counterparty: obligation.counterparty,
              category: obligation.category,
              title: obligation.title,
              description: obligation.description,
              triggerType: obligation.triggerType,
              triggerEvent: obligation.triggerEvent,
              periodValue: obligation.periodValue,
              periodBasis: obligation.periodBasis,
              periodDirection: obligation.periodDirection,
              recurrenceDays: obligation.recurrenceDays,
              isTimeBar: obligation.isTimeBar,
              consequence: obligation.consequence,
              sourceQuote: obligation.sourceQuote,
              confidence: obligation.confidence?.toNumber() ?? null,
              reviewNote: obligation.reviewNote,
              reviewStatus: obligation.reviewStatus,
            }}
          />
          <SourceClause
            clause={obligation.clause}
            quote={obligation.sourceQuote}
            language={contract.language}
          />
        </div>
      ) : (
        <div className="border-border rounded-lg border bg-white p-4">
          <p>{t(reviewedCount > 0 ? "allDone" : "nothingYet")}</p>
          {reviewedCount > 0 && (
            <Link
              href={`/contracts/${contract.id}/register`}
              className="mt-2 inline-block font-medium underline underline-offset-4"
            >
              {t("openRegister")}
            </Link>
          )}
        </div>
      )}

      {pendingCount > 0 && <OutsideReview contractId={contract.id} />}
    </div>
  );
}
