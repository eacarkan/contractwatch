import {
  getFormatter,
  getTranslations,
  setRequestLocale,
} from "next-intl/server";

import { NewContractForm } from "@/components/new-contract-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { Link } from "@/lib/i18n/navigation";

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Contracts");
  const contractTypes = await getTranslations("ContractType");
  const languages = await getTranslations("Language");
  const format = await getFormatter();

  const contracts = await prisma.contract.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { documents: true } } },
  });

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section>
        <h1 className="font-heading mb-4 text-3xl font-semibold">
          {t("title")}
        </h1>
        {contracts.length === 0 ? (
          <p className="text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.type")}</TableHead>
                <TableHead>{t("columns.language")}</TableHead>
                <TableHead className="text-right">
                  {t("columns.documents")}
                </TableHead>
                <TableHead>{t("columns.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="font-medium whitespace-normal">
                    <Link
                      href={`/contracts/${contract.id}/documents`}
                      className="underline-offset-4 hover:underline"
                    >
                      {contract.name}
                    </Link>
                  </TableCell>
                  <TableCell>{contractTypes(contract.type)}</TableCell>
                  <TableCell>
                    {languages(contract.language as "fr" | "en")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {contract._count.documents}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {format.dateTime(contract.createdAt, {
                      dateStyle: "medium",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <aside className="border-border self-start rounded-lg border bg-white p-4">
        <NewContractForm />
      </aside>
    </div>
  );
}
