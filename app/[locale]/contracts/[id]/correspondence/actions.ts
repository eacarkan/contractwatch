"use server";

import { getLocale } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/components/action-form";
import {
  deleteLetter,
  linkLetter,
  unlinkLetter,
} from "@/lib/correspondence/service";
import { parseIsoDate } from "@/lib/deadline";
import { prisma } from "@/lib/db";
import {
  CorrDirection,
  CorrRelation,
  PartyRole,
} from "@/lib/generated/prisma/enums";
import { suggestLinks, type SuggestResult } from "@/lib/llm/match";

function blankToNull(value: unknown) {
  return value === "" || value === undefined ? null : value;
}

const letterSchema = z.object({
  direction: z.enum(CorrDirection),
  sentOn: z.iso.date().transform(parseIsoDate),
  receivedOn: z.preprocess(
    blankToNull,
    z.iso.date().transform(parseIsoDate).nullable(),
  ),
  referenceNo: z.preprocess(blankToNull, z.string().trim().max(120).nullable()),
  fromParty: z.enum(PartyRole),
  toParty: z.enum(PartyRole),
  subject: z.string().trim().min(1).max(300),
  summary: z.preprocess(blankToNull, z.string().trim().max(5000).nullable()),
});

function refresh() {
  revalidatePath("/[locale]/contracts/[id]", "layout");
}

export async function addLetter(
  contractId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = letterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };

  await prisma.correspondence.create({ data: { ...parsed.data, contractId } });
  refresh();
  return { error: null };
}

export async function removeLetter(
  contractId: string,
  letterId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  await deleteLetter(contractId, letterId);
  refresh();
  return { error: null };
}

const linkSchema = z.object({
  target: z.string().regex(/^[0-9a-f-]{36}(\|[0-9a-f-]{36})?$/),
  relation: z.enum(CorrRelation),
});

export async function addLink(
  contractId: string,
  letterId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = linkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };

  const [obligationId, deadlineId] = parsed.data.target.split("|");
  const result = await linkLetter(contractId, letterId, {
    obligationId: obligationId!,
    deadlineId: deadlineId ?? null,
    relation: parsed.data.relation,
  });
  if (!result.ok) return { error: result.error };

  refresh();
  return { error: null };
}

export async function removeLink(
  contractId: string,
  letterId: string,
  obligationId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  await unlinkLetter(contractId, letterId, obligationId);
  refresh();
  return { error: null };
}

export async function requestSuggestions(
  contractId: string,
  letterId: string,
): Promise<SuggestResult> {
  const language = (await getLocale()) === "fr" ? "French" : "English";
  return suggestLinks(contractId, letterId, language);
}
