import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ContractHeader } from "@/components/contract-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { ObligationCategory, PartyRole } from "@/lib/generated/prisma/enums";
import { Link } from "@/lib/i18n/navigation";
import { formatIsoDate } from "@/lib/register/export";
import { filtersToQuery, parseFilters } from "@/lib/register/filters";
import { getRegisterRows } from "@/lib/register/query";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) notFound();

  const filters = parseFilters(await searchParams);
  const rows = await getRegisterRows(id, filters);

  const t = await getTranslations("Register");
  const values = await getTranslations("Review.values");
  const roles = await getTranslations("PartyRole");
  const categories = await getTranslations("ObligationCategory");
  const bases = await getTranslations("DayBasis");
  const statuses = await getTranslations("ReviewStatus");

  const query = filtersToQuery(filters);
  const exportHref = (format: string) =>
    `/api/contracts/${id}/register/export?format=${format}&locale=${locale}${query && `&${query}`}`;
  const selects: {
    name: keyof typeof filters;
    options: [string, string][];
  }[] = [
    {
      name: "obligor",
      options: Object.values(PartyRole).map((value) => [value, roles(value)]),
    },
    {
      name: "category",
      options: Object.values(ObligationCategory).map((value) => [
        value,
        categories(value),
      ]),
    },
    {
      name: "timeBar",
      options: [
        ["yes", values("yes")],
        ["no", values("no")],
      ],
    },
    {
      name: "status",
      options: [
        ["CONFIRMED", statuses("CONFIRMED")],
        ["EDITED", statuses("EDITED")],
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <ContractHeader contract={contract} active="register" />

      <form
        method="get"
        className="border-border flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4"
      >
        {selects.map(({ name, options }) => (
          <div key={name} className="grid gap-1.5">
            <Label htmlFor={name}>{t(`filters.${name}`)}</Label>
            <NativeSelect
              id={name}
              name={name}
              defaultValue={filters[name] ?? ""}
            >
              <NativeSelectOption value="">
                {t("filters.all")}
              </NativeSelectOption>
              {options.map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        ))}
        <Button type="submit" variant="outline">
          {t("filters.apply")}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium" role="status">
          {t("count", { count: rows.length })}
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href={exportHref("csv")}>{t("exportCsv")}</a>
          </Button>
          <Button asChild variant="outline">
            <a href={exportHref("xlsx")}>{t("exportXlsx")}</a>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          {t(query ? "noMatches" : "empty")}
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-lg border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.ref")}</TableHead>
                <TableHead>{t("columns.title")}</TableHead>
                <TableHead>{t("columns.obligor")}</TableHead>
                <TableHead>{t("columns.category")}</TableHead>
                <TableHead>{t("columns.period")}</TableHead>
                <TableHead>{t("columns.timeBar")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.nextDue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="align-top">
                  <TableCell className="font-heading text-base font-semibold tabular-nums">
                    {row.clauseRef}
                  </TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    <Link
                      href={`/contracts/${id}/review?obligation=${row.id}`}
                      lang={contract.language}
                      className="underline-offset-4 hover:underline"
                    >
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell>{roles(row.obligor)}</TableCell>
                  <TableCell>{categories(row.category)}</TableCell>
                  <TableCell>
                    {row.periodValue === null
                      ? values("noPeriod")
                      : `${row.periodValue} ${row.periodBasis ? bases(row.periodBasis) : ""}`}
                  </TableCell>
                  <TableCell>
                    {row.isTimeBar ? values("yes") : values("no")}
                  </TableCell>
                  <TableCell>{statuses(row.reviewStatus)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatIsoDate(row.deadlines[0]?.dueOn) ?? "–"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
