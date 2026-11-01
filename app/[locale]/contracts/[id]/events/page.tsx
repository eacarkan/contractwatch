import { notFound } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { ActionForm } from "@/components/action-form";
import { ContractHeader } from "@/components/contract-header";
import { StatusLabel } from "@/components/deadlines/status-label";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  canGenerateDeadlines,
  deadlineView,
  isoDate,
  todayUtc,
} from "@/lib/deadline";
import { describeRule } from "@/lib/deadline-text";
import { prisma } from "@/lib/db";
import { EVENT_TYPES } from "@/lib/events";
import { Link } from "@/lib/i18n/navigation";

import {
  addHoliday,
  deleteEvent,
  removeHoliday,
  saveContractDates,
  saveEvent,
} from "./actions";

const SECTION = "border-border rounded-lg border bg-white p-4";

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { locale, id } = await params;
  const { edit } = await searchParams;
  setRequestLocale(locale);

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { holidays: { orderBy: { date: "asc" } } },
  });
  if (!contract) notFound();

  const [events, reviewed] = await Promise.all([
    prisma.event.findMany({
      where: { contractId: id },
      orderBy: { occurredOn: "asc" },
      include: {
        deadlines: {
          orderBy: { dueOn: "asc" },
          include: {
            obligation: { select: { clauseRef: true, title: true } },
          },
        },
      },
    }),
    prisma.obligation.findMany({
      where: { contractId: id, reviewStatus: { in: ["CONFIRMED", "EDITED"] } },
      orderBy: [{ clause: { orderIndex: "asc" } }, { createdAt: "asc" }],
    }),
  ]);
  const usable = reviewed.filter(canGenerateDeadlines);
  const editing = events.find((event) => event.id === edit) ?? null;
  const triggered = new Set(
    editing?.deadlines.map(({ obligationId }) => obligationId),
  );

  const t = await getTranslations("Events");
  const ruleText = await getTranslations("DeadlineRule");
  const format = await getFormatter();
  const date = (value: Date) =>
    format.dateTime(value, { dateStyle: "medium", timeZone: "UTC" });
  const today = todayUtc();

  return (
    <div className="grid grid-cols-1 gap-6">
      <ContractHeader contract={contract} active="events" />

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-6">
          <section className={SECTION}>
            <h2 className="font-heading mb-3 text-xl font-semibold">
              {t(editing ? "editTitle" : "newTitle")}
            </h2>
            <ActionForm
              key={editing?.id ?? "new"}
              action={saveEvent.bind(null, id, editing?.id ?? null, locale)}
              submit={t(editing ? "save" : "add")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="name">{t("name")}</Label>
                  <Input
                    id="name"
                    name="name"
                    required
                    maxLength={200}
                    defaultValue={editing?.name}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="eventType">{t("type")}</Label>
                  <NativeSelect
                    id="eventType"
                    name="eventType"
                    className="w-full"
                    defaultValue={editing?.eventType ?? "INSTRUCTION"}
                  >
                    {EVENT_TYPES.map((type) => (
                      <NativeSelectOption key={type} value={type}>
                        {t(`types.${type}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="occurredOn">{t("date")}</Label>
                  <Input
                    id="occurredOn"
                    name="occurredOn"
                    type="date"
                    required
                    defaultValue={
                      editing ? isoDate(editing.occurredOn) : undefined
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="source">{t("source")}</Label>
                  <Input
                    id="source"
                    name="source"
                    maxLength={200}
                    defaultValue={editing?.source ?? ""}
                  />
                </div>
              </div>

              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">
                  {t("triggers")}
                </legend>
                {usable.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {t("noObligations")}
                  </p>
                ) : (
                  <div className="border-border grid max-h-72 gap-1 overflow-y-auto rounded-md border p-2">
                    {usable.map((obligation) => (
                      <label
                        key={obligation.id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="obligationIds"
                          value={obligation.id}
                          defaultChecked={triggered.has(obligation.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium tabular-nums">
                            {obligation.clauseRef}
                          </span>{" "}
                          <span lang={contract.language}>
                            {obligation.title}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            </ActionForm>
            {editing && (
              <Link
                href={`/contracts/${id}/events`}
                className="mt-3 inline-block text-sm underline underline-offset-4"
              >
                {t("cancel")}
              </Link>
            )}
          </section>

          {events.length === 0 ? (
            <p className="text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="grid gap-4">
              {events.map((event) => (
                <li key={event.id} className={SECTION}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-heading text-lg font-semibold">
                      {event.name}
                    </h2>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {date(event.occurredOn)}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t(
                      `types.${event.eventType as (typeof EVENT_TYPES)[number]}`,
                    )}
                    {event.source && `, ${event.source}`}
                  </p>

                  {event.deadlines.length === 0 ? (
                    <p className="text-muted-foreground mt-2 text-sm">
                      {t("noDeadlines")}
                    </p>
                  ) : (
                    <ul className="mt-3 grid gap-2">
                      {event.deadlines.map((deadline) => (
                        <li
                          key={deadline.id}
                          className="border-border grid gap-0.5 border-t pt-2 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold tabular-nums">
                              {date(deadline.dueOn)}
                            </span>
                            <StatusLabel view={deadlineView(deadline, today)} />
                            <Link
                              href={`/contracts/${id}/timeline?obligation=${deadline.obligationId}`}
                              lang={contract.language}
                              className="underline-offset-4 hover:underline"
                            >
                              {deadline.obligation.clauseRef}{" "}
                              {deadline.obligation.title}
                            </Link>
                          </div>
                          <p className="text-muted-foreground">
                            {describeRule(deadline.computedRule, ruleText)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-3 flex items-center gap-4">
                    <Link
                      href={`/contracts/${id}/events?edit=${event.id}`}
                      className="text-sm underline underline-offset-4"
                    >
                      {t("edit")}
                    </Link>
                    <ActionForm
                      action={deleteEvent.bind(null, id, event.id)}
                      submit={t("delete")}
                      variant="ghost"
                      className=""
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="grid gap-6">
          <section className={SECTION}>
            <h2 className="font-heading mb-3 text-lg font-semibold">
              {t("dates.title")}
            </h2>
            <ActionForm
              action={saveContractDates.bind(null, id)}
              submit={t("dates.save")}
              variant="outline"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="commencementDate">
                  {t("dates.commencement")}
                </Label>
                <Input
                  id="commencementDate"
                  name="commencementDate"
                  type="date"
                  defaultValue={
                    contract.commencementDate
                      ? isoDate(contract.commencementDate)
                      : ""
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="timeForCompletionDays">
                  {t("dates.timeForCompletion")}
                </Label>
                <Input
                  id="timeForCompletionDays"
                  name="timeForCompletionDays"
                  type="number"
                  min={1}
                  defaultValue={contract.timeForCompletionDays ?? ""}
                />
              </div>
            </ActionForm>
          </section>

          <section className={SECTION}>
            <h2 className="font-heading text-lg font-semibold">
              {t("holidays.title")}
            </h2>
            <p className="text-muted-foreground mb-3 text-sm">
              {t("holidays.help")}
            </p>
            <ActionForm
              action={addHoliday.bind(null, id)}
              submit={t("holidays.add")}
              variant="outline"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="holidayDate">{t("holidays.date")}</Label>
                <Input id="holidayDate" name="date" type="date" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="holidayName">{t("holidays.name")}</Label>
                <Input id="holidayName" name="name" required maxLength={120} />
              </div>
            </ActionForm>
            {contract.holidays.length > 0 && (
              <ul className="mt-4 grid gap-1 text-sm">
                {contract.holidays.map((holiday) => (
                  <li
                    key={holiday.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>
                      <span className="tabular-nums">{date(holiday.date)}</span>
                      , {holiday.name}
                    </span>
                    <ActionForm
                      action={removeHoliday.bind(null, id, holiday.id)}
                      submit={t("holidays.remove")}
                      variant="ghost"
                      className=""
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
