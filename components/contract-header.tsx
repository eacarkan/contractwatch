import { getTranslations } from "next-intl/server";

import type { ContractType } from "@/lib/generated/prisma/enums";
import { Link } from "@/lib/i18n/navigation";

const SECTIONS = ["documents", "review", "register"] as const;

export async function ContractHeader({
  contract,
  active,
}: {
  contract: { id: string; name: string; type: ContractType };
  active: (typeof SECTIONS)[number];
}) {
  const t = await getTranslations("ContractNav");
  const contractTypes = await getTranslations("ContractType");

  return (
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
      <nav aria-label={t("label")} className="border-border mt-4 border-b">
        <ul className="flex flex-wrap gap-x-6">
          {SECTIONS.map((section) => (
            <li key={section}>
              <Link
                href={`/contracts/${contract.id}/${section}`}
                aria-current={section === active ? "page" : undefined}
                className="aria-[current=page]:border-foreground hover:border-input -mb-px inline-block border-b-2 border-transparent py-2 font-medium"
              >
                {t(section)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
