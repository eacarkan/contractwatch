import { notFound } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { ContractHeader } from "@/components/contract-header";
import { StatusLabel } from "@/components/deadlines/status-label";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { deadlineView, todayUtc } from "@/lib/deadline";
import { describeRule } from "@/lib/deadline-text";
import { prisma } from "@/lib/db";
import { buildTimeline } from "@/lib/timeline";

export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ obligation?: string }>;
}) {
  const { locale, id } = await params;
  const { obligation: requested } = await searchParams;
  setRequestLocale(locale);

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) notFound();

  const obligations = await prisma.obligation.findMany({
    where: {
      contractId: id,
      OR: [
        { deadlines: { some: {} } },
        { links: { some: {} } },
        { id: requested },
      ],
    },
    orderBy: [{ clause: { orderIndex: "asc" } }, { createdAt: "asc" }],
    select: { id: true, clauseRef: true, title: true },
  });

  const selectedId = requested ?? obligations[0]?.id;
  const selected = selectedId
    ? await prisma.obligation.findFirst({
        where: { id: selectedId, contractId: id },
        include: {
          deadlines: {
            orderBy: { dueOn: "asc" },
            include: {
              event: { select: { id: true, name: true, occurredOn: true } },
            },
          },
          links: { include: { correspondence: true } },
        },
      })
    : null;
  if (requested && !selected) notFound();

  const t = await getTranslations("Timeline");
  const ruleText = await getTranslations("DeadlineRule");
  const relations = await getTranslations("CorrRelation");
  const directions = await getTranslations("Correspondence.directions");
  const format = await getFormatter();
  const today = todayUtc();

  return (
    <div className="grid grid-cols-1 gap-6">
      <ContractHeader contract={contract} active="timeline" />

      {obligations.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <form
          method="get"
          className="border-border flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4"
        >
          <div className="grid min-w-56 flex-1 gap-1.5">
            <Label htmlFor="obligation">{t("obligation")}</Label>
            <NativeSelect
              id="obligation"
              name="obligation"
              className="w-full"
              defaultValue={selectedId}
            >
              {obligations.map((obligation) => (
                <NativeSelectOption key={obligation.id} value={obligation.id}>
                  {obligation.clauseRef} {obligation.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline">
            {t("show")}
          </Button>
        </form>
      )}

      {selected && (
        <section className="border-border rounded-lg border bg-white p-4">
          <h2
            lang={contract.language}
            className="font-heading text-xl font-semibold"
          >
            {selected.clauseRef} {selected.title}
          </h2>
          <p lang={contract.language} className="mt-1 text-sm">
            {selected.description}
          </p>

          <ol className="border-border mt-4 grid gap-4 border-l-2 pl-4">
            {buildTimeline(selected).map((entry, index) => (
              <li key={index} className="grid gap-0.5 text-sm">
                <p className="text-muted-foreground tabular-nums">
                  {format.dateTime(entry.date, {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  })}
                </p>
                {entry.kind === "trigger" && (
                  <p>
                    <span className="font-semibold">{t("trigger")}</span>{" "}
                    {entry.name}
                  </p>
                )}
                {entry.kind === "due" && (
                  <div>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{t("due")}</span>
                      <StatusLabel
                        view={deadlineView(
                          { status: entry.status, dueOn: entry.date },
                          today,
                        )}
                      />
                    </p>
                    <p className="text-muted-foreground">
                      {describeRule(entry.rule, ruleText)}
                    </p>
                  </div>
                )}
                {entry.kind === "letter" && (
                  <p>
                    <span className="font-semibold">
                      {directions(entry.direction)}
                    </span>{" "}
                    {entry.subject}
                    {entry.referenceNo && `, ${entry.referenceNo}`} (
                    {relations(entry.relation)})
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
