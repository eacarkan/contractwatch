import { notFound } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { ContractHeader } from "@/components/contract-header";
import { LinkSuggestions } from "@/components/correspondence/link-suggestions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { prisma } from "@/lib/db";
import {
  CorrDirection,
  CorrRelation,
  PartyRole,
} from "@/lib/generated/prisma/enums";
import { Link } from "@/lib/i18n/navigation";
import { getModelConfig } from "@/lib/llm/extract";

import {
  addLetter,
  addLink,
  removeLetter,
  removeLink,
  requestSuggestions,
} from "./actions";

const SECTION = "border-border rounded-lg border bg-white p-4";

export default async function CorrespondencePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) notFound();

  const [letters, obligations] = await Promise.all([
    prisma.correspondence.findMany({
      where: { contractId: id },
      orderBy: { sentOn: "desc" },
      include: {
        links: {
          include: {
            obligation: { select: { clauseRef: true, title: true } },
            deadline: { select: { dueOn: true, status: true, metById: true } },
          },
        },
      },
    }),
    prisma.obligation.findMany({
      where: { contractId: id, reviewStatus: { in: ["CONFIRMED", "EDITED"] } },
      orderBy: [{ clause: { orderIndex: "asc" } }, { createdAt: "asc" }],
      include: { deadlines: { orderBy: { dueOn: "asc" } } },
    }),
  ]);

  const t = await getTranslations("Correspondence");
  const roles = await getTranslations("PartyRole");
  const relations = await getTranslations("CorrRelation");
  const format = await getFormatter();
  const date = (value: Date) =>
    format.dateTime(value, { dateStyle: "medium", timeZone: "UTC" });
  const canSuggest = getModelConfig() !== null;

  const parties = Object.values(PartyRole);

  return (
    <div className="grid grid-cols-1 gap-6">
      <ContractHeader contract={contract} active="correspondence" />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_2fr]">
        <section className={SECTION}>
          <h2 className="font-heading mb-3 text-xl font-semibold">
            {t("newTitle")}
          </h2>
          <ActionForm action={addLetter.bind(null, id)} submit={t("add")}>
            <div className="grid gap-1.5">
              <Label htmlFor="direction">{t("direction")}</Label>
              <NativeSelect
                id="direction"
                name="direction"
                className="w-full"
                defaultValue="OUT"
              >
                {Object.values(CorrDirection).map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {t(`directions.${value}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sentOn">{t("sentOn")}</Label>
              <Input id="sentOn" name="sentOn" type="date" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="receivedOn">{t("receivedOn")}</Label>
              <Input id="receivedOn" name="receivedOn" type="date" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="referenceNo">{t("reference")}</Label>
              <Input id="referenceNo" name="referenceNo" maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fromParty">{t("from")}</Label>
              <NativeSelect
                id="fromParty"
                name="fromParty"
                className="w-full"
                defaultValue="CONTRACTOR"
              >
                {parties.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {roles(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="toParty">{t("to")}</Label>
              <NativeSelect
                id="toParty"
                name="toParty"
                className="w-full"
                defaultValue="ENGINEER"
              >
                {parties.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {roles(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="subject">{t("subject")}</Label>
              <Input id="subject" name="subject" required maxLength={300} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="summary">{t("summary")}</Label>
              <Textarea id="summary" name="summary" maxLength={5000} rows={3} />
            </div>
          </ActionForm>
        </section>

        <div className="grid min-w-0 gap-4">
          {letters.length === 0 ? (
            <p className="text-muted-foreground">{t("empty")}</p>
          ) : (
            letters.map((letter) => {
              const confirmLink = addLink.bind(null, id, letter.id);
              async function confirmSuggestion(
                obligationId: string,
                relation: string,
              ) {
                "use server";
                const form = new FormData();
                form.set("target", obligationId);
                form.set("relation", relation);
                await confirmLink({ error: null }, form);
              }
              return (
                <article key={letter.id} className={SECTION}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-heading text-lg font-semibold">
                      {letter.subject}
                    </h2>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {date(letter.sentOn)}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t(`directions.${letter.direction}`)},{" "}
                    {t("fromTo", {
                      from: roles(letter.fromParty),
                      to: roles(letter.toParty),
                    })}
                    {letter.referenceNo && `, ${letter.referenceNo}`}
                  </p>
                  {letter.summary && (
                    <p className="mt-2 text-sm">{letter.summary}</p>
                  )}

                  {letter.links.length > 0 && (
                    <ul className="mt-3 grid gap-2">
                      {letter.links.map((link) => (
                        <li
                          key={link.obligationId}
                          className="border-border flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"
                        >
                          <span>
                            {relations(link.relation)}:{" "}
                            <Link
                              href={`/contracts/${id}/timeline?obligation=${link.obligationId}`}
                              lang={contract.language}
                              className="underline underline-offset-4"
                            >
                              {link.obligation.clauseRef}{" "}
                              {link.obligation.title}
                            </Link>
                            {link.deadline?.metById === letter.id && (
                              <span className="ml-2 font-medium text-emerald-800">
                                {t("met", { date: date(link.deadline.dueOn) })}
                              </span>
                            )}
                            {link.relation === "SATISFIES" &&
                              link.deadline &&
                              link.deadline.metById !== letter.id && (
                                <span className="text-destructive ml-2 font-medium">
                                  {t("notMet", {
                                    date: date(link.deadline.dueOn),
                                  })}
                                </span>
                              )}
                          </span>
                          <ActionForm
                            action={removeLink.bind(
                              null,
                              id,
                              letter.id,
                              link.obligationId,
                            )}
                            submit={t("unlink")}
                            variant="ghost"
                            className=""
                          />
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="border-border mt-3 grid gap-3 border-t pt-3">
                    <ActionForm
                      action={confirmLink}
                      submit={t("link")}
                      variant="outline"
                      className="flex flex-wrap items-end gap-3"
                    >
                      <div className="grid min-w-56 flex-1 gap-1.5">
                        <Label htmlFor={`target-${letter.id}`}>
                          {t("linkTo")}
                        </Label>
                        <NativeSelect
                          id={`target-${letter.id}`}
                          name="target"
                          className="w-full"
                          required
                          defaultValue=""
                        >
                          <NativeSelectOption value="" disabled>
                            {t("choose")}
                          </NativeSelectOption>
                          {obligations.flatMap((obligation) => [
                            <NativeSelectOption
                              key={obligation.id}
                              value={obligation.id}
                            >
                              {obligation.clauseRef} {obligation.title}
                            </NativeSelectOption>,
                            ...obligation.deadlines.map((deadline) => (
                              <NativeSelectOption
                                key={deadline.id}
                                value={`${obligation.id}|${deadline.id}`}
                              >
                                {obligation.clauseRef} {obligation.title},{" "}
                                {t("dueOn", { date: date(deadline.dueOn) })}
                              </NativeSelectOption>
                            )),
                          ])}
                        </NativeSelect>
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`relation-${letter.id}`}>
                          {t("relation")}
                        </Label>
                        <NativeSelect
                          id={`relation-${letter.id}`}
                          name="relation"
                          defaultValue="SATISFIES"
                        >
                          {Object.values(CorrRelation).map((value) => (
                            <NativeSelectOption key={value} value={value}>
                              {relations(value)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                    </ActionForm>

                    {canSuggest && (
                      <LinkSuggestions
                        request={requestSuggestions.bind(null, id, letter.id)}
                        confirm={confirmSuggestion}
                      />
                    )}
                  </div>

                  <div className="mt-2">
                    <ActionForm
                      action={removeLetter.bind(null, id, letter.id)}
                      submit={t("delete")}
                      variant="ghost"
                      className=""
                    />
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
