"use server";

import { getLocale } from "next-intl/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { ContractType } from "@/lib/generated/prisma/enums";
import { redirect } from "@/lib/i18n/navigation";

const newContractSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(ContractType),
  language: z.enum(["fr", "en"]),
});

export type CreateContractState = { error: "name" | "invalid" | null };

export async function createContract(
  _previous: CreateContractState,
  formData: FormData,
): Promise<CreateContractState> {
  const parsed = newContractSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const nameFailed = parsed.error.issues.some(
      (issue) => issue.path[0] === "name",
    );
    return { error: nameFailed ? "name" : "invalid" };
  }

  const contract = await prisma.contract.create({ data: parsed.data });
  redirect({
    href: `/contracts/${contract.id}/documents`,
    locale: await getLocale(),
  });
  return { error: null };
}
