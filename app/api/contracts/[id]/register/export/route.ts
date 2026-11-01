import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/db";
import { routing } from "@/lib/i18n/routing";
import { formatIsoDate, toCsv, type ExportCell } from "@/lib/register/export";
import { parseFilters } from "@/lib/register/filters";
import { getRegisterRows } from "@/lib/register/query";

const CONTENT_TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const query = Object.fromEntries(new URL(request.url).searchParams);

  const format = query.format === "xlsx" ? "xlsx" : "csv";
  const locale = hasLocale(routing.locales, query.locale)
    ? query.locale
    : routing.defaultLocale;

  const contract = await prisma.contract.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!contract) {
    return NextResponse.json({ error: "contractNotFound" }, { status: 404 });
  }

  const t = await getTranslations({ locale, namespace: "Register" });
  const fields = await getTranslations({ locale, namespace: "Review.fields" });
  const values = await getTranslations({ locale, namespace: "Review.values" });
  const demo = await getTranslations({ locale, namespace: "Demo" });
  const roles = await getTranslations({ locale, namespace: "PartyRole" });
  const categories = await getTranslations({
    locale,
    namespace: "ObligationCategory",
  });
  const triggers = await getTranslations({ locale, namespace: "TriggerType" });
  const bases = await getTranslations({ locale, namespace: "DayBasis" });
  const directions = await getTranslations({
    locale,
    namespace: "PeriodDirection",
  });
  const statuses = await getTranslations({ locale, namespace: "ReviewStatus" });

  const rows = await getRegisterRows(id, parseFilters(query));

  const table: ExportCell[][] = [
    [demo("banner")],
    [
      fields("clauseRef"),
      fields("title"),
      fields("description"),
      fields("obligor"),
      fields("counterparty"),
      fields("category"),
      fields("triggerType"),
      fields("triggerEvent"),
      fields("periodValue"),
      fields("periodBasis"),
      fields("periodDirection"),
      fields("recurrenceDays"),
      fields("isTimeBar"),
      fields("consequence"),
      fields("sourceQuote"),
      t("columns.status"),
      t("columns.nextDue"),
    ],
    ...rows.map((row): ExportCell[] => [
      row.clauseRef,
      row.title,
      row.description,
      roles(row.obligor),
      row.counterparty && roles(row.counterparty),
      categories(row.category),
      triggers(row.triggerType),
      row.triggerEvent,
      row.periodValue,
      row.periodBasis && bases(row.periodBasis),
      directions(row.periodDirection),
      row.recurrenceDays,
      row.isTimeBar ? values("yes") : values("no"),
      row.consequence,
      row.sourceQuote,
      statuses(row.reviewStatus),
      formatIsoDate(row.deadlines[0]?.dueOn),
    ]),
  ];

  let body: BodyInit;
  if (format === "csv") {
    body = toCsv(table);
  } else {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(t("title"));
    sheet.addRows(table);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(2).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 2 }];
    body = Buffer.from(await workbook.xlsx.writeBuffer());
  }

  return new NextResponse(body, {
    headers: {
      "content-type": CONTENT_TYPES[format],
      "content-disposition": `attachment; filename="obligations-register.${format}"`,
    },
  });
}
