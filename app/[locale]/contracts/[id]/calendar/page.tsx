import { notFound } from "next/navigation";
import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { ContractHeader } from "@/components/contract-header";
import { StatusLabel } from "@/components/deadlines/status-label";
import {
  daysUntil,
  deadlineView,
  isoDate,
  isWorkingDay,
  monthGrid,
  todayUtc,
} from "@/lib/deadline";
import { prisma } from "@/lib/db";
import { Link } from "@/lib/i18n/navigation";

function parseMonth(value: string | undefined, today: Date) {
  const match = value?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  return match
    ? { year: Number(match[1]), month: Number(match[2]) - 1 }
    : { year: today.getUTCFullYear(), month: today.getUTCMonth() };
}

function monthParam(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  return first.toISOString().slice(0, 7);
}

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale, id } = await params;
  const { month: requested } = await searchParams;
  setRequestLocale(locale);

  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { holidays: true },
  });
  if (!contract) notFound();

  const deadlines = await prisma.deadline.findMany({
    where: { obligation: { contractId: id } },
    orderBy: { dueOn: "asc" },
    include: {
      obligation: { select: { clauseRef: true, title: true, isTimeBar: true } },
    },
  });

  const t = await getTranslations("Calendar");
  const format = await getFormatter();
  const today = todayUtc();
  const { year, month } = parseMonth(requested, today);
  const weeks = monthGrid(year, month);
  const holidays = new Set(contract.holidays.map((h) => isoDate(h.date)));
  const timeZone = "UTC";

  const byDay = Map.groupBy(deadlines, ({ dueOn }) => isoDate(dueOn));
  const open = deadlines.filter(
    (deadline) => deadline.status === "OPEN" || deadline.status === "MISSED",
  );
  const groups = [
    {
      key: "overdue",
      rows: open.filter((row) => deadlineView(row, today) === "OVERDUE"),
    },
    {
      key: "next14",
      rows: open.filter((row) => {
        const days = daysUntil(row.dueOn, today);
        return days >= 0 && days <= 14;
      }),
    },
    {
      key: "next30",
      rows: open.filter((row) => {
        const days = daysUntil(row.dueOn, today);
        return days > 14 && days <= 30;
      }),
    },
  ] as const;

  const weekdays = weeks[0]!.map((day) =>
    format.dateTime(day, { weekday: "short", timeZone }),
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      <ContractHeader contract={contract} active="calendar" />

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="border-border min-w-0 rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link
              href={`/contracts/${id}/calendar?month=${monthParam(year, month - 1)}`}
              className="text-sm underline underline-offset-4"
            >
              {t("previous")}
            </Link>
            <h2 className="font-heading text-xl font-semibold">
              {format.dateTime(new Date(Date.UTC(year, month, 1)), {
                month: "long",
                year: "numeric",
                timeZone,
              })}
            </h2>
            <Link
              href={`/contracts/${id}/calendar?month=${monthParam(year, month + 1)}`}
              className="text-sm underline underline-offset-4"
            >
              {t("next")}
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm">
              <thead>
                <tr>
                  {weekdays.map((weekday) => (
                    <th
                      key={weekday}
                      scope="col"
                      className="text-muted-foreground p-1 text-left font-medium"
                    >
                      {weekday}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={isoDate(week[0]!)}>
                    {week.map((day) => {
                      const key = isoDate(day);
                      const inMonth = day.getUTCMonth() === month;
                      return (
                        <td
                          key={key}
                          className={`border-border h-24 border p-1 align-top ${
                            isWorkingDay(day, holidays) ? "" : "bg-muted/60"
                          } ${inMonth ? "" : "text-muted-foreground"}`}
                        >
                          <span
                            className={`tabular-nums ${key === isoDate(today) ? "font-bold underline" : ""}`}
                          >
                            {day.getUTCDate()}
                          </span>
                          <ul className="mt-1 grid gap-1">
                            {byDay.get(key)?.map((deadline) => (
                              <li key={deadline.id}>
                                <Link
                                  href={`/contracts/${id}/timeline?obligation=${deadline.obligationId}`}
                                  lang={contract.language}
                                  title={deadline.obligation.title}
                                  className="block truncate underline-offset-2 hover:underline"
                                >
                                  {deadline.obligation.clauseRef}{" "}
                                  {deadline.obligation.title}
                                </Link>
                                <StatusLabel
                                  view={deadlineView(deadline, today)}
                                />
                              </li>
                            ))}
                          </ul>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="grid gap-4">
          {groups.map(({ key, rows }) => (
            <section
              key={key}
              className="border-border rounded-lg border bg-white p-4"
            >
              <h2 className="font-heading text-lg font-semibold">
                {t(`groups.${key}`, { count: rows.length })}
              </h2>
              {rows.length === 0 ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  {t("none")}
                </p>
              ) : (
                <ul className="mt-2 grid gap-2 text-sm">
                  {rows.map((row) => (
                    <li key={row.id}>
                      <span className="font-semibold tabular-nums">
                        {format.dateTime(row.dueOn, {
                          dateStyle: "medium",
                          timeZone,
                        })}
                      </span>{" "}
                      <Link
                        href={`/contracts/${id}/timeline?obligation=${row.obligationId}`}
                        lang={contract.language}
                        className="underline-offset-4 hover:underline"
                      >
                        {row.obligation.clauseRef} {row.obligation.title}
                      </Link>
                      {row.obligation.isTimeBar && (
                        <span className="text-destructive ml-1 text-xs font-medium">
                          {t("timeBar")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {deadlines.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {t("empty")}{" "}
              <Link
                href={`/contracts/${id}/events`}
                className="underline underline-offset-4"
              >
                {t("openEvents")}
              </Link>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
