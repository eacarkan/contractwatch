"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/components/action-form";
import { parseIsoDate } from "@/lib/deadline";
import { recomputeContract, syncEventDeadlines } from "@/lib/deadlines/service";
import { prisma } from "@/lib/db";
import { redirect } from "@/lib/i18n/navigation";
import { EVENT_TYPES } from "@/lib/events";

const isoDateField = z.iso.date().transform(parseIsoDate);

const eventSchema = z.object({
  name: z.string().trim().min(1).max(200),
  eventType: z.enum(EVENT_TYPES),
  occurredOn: isoDateField,
  source: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().trim().max(200).nullable(),
  ),
  obligationIds: z.array(z.uuid()).max(500),
});

function refresh() {
  revalidatePath("/[locale]/contracts/[id]", "layout");
}

/** Only obligations already reviewed in can hang from an event. */
async function reviewedIds(contractId: string, ids: string[]) {
  const rows = await prisma.obligation.findMany({
    where: {
      contractId,
      id: { in: ids },
      reviewStatus: { in: ["CONFIRMED", "EDITED"] },
    },
    select: { id: true },
  });
  return rows.map(({ id }) => id);
}

export async function saveEvent(
  contractId: string,
  eventId: string | null,
  locale: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = eventSchema.safeParse({
    ...Object.fromEntries(formData),
    source: formData.get("source") ?? null,
    obligationIds: formData.getAll("obligationIds"),
  });
  if (!parsed.success) return { error: "invalid" };

  const { obligationIds, ...data } = parsed.data;
  const ids = await reviewedIds(contractId, obligationIds);

  const saved = await prisma.$transaction(async (tx) => {
    if (eventId) {
      const existing = await tx.event.findFirst({
        where: { id: eventId, contractId },
        select: { id: true },
      });
      if (!existing) return false;
    }
    const event = eventId
      ? await tx.event.update({ where: { id: eventId }, data })
      : await tx.event.create({ data: { ...data, contractId } });
    await syncEventDeadlines(tx, contractId, event, ids);
    return true;
  });
  if (!saved) return { error: "notFound" };

  refresh();
  if (eventId) redirect({ href: `/contracts/${contractId}/events`, locale });
  return { error: null };
}

export async function deleteEvent(
  contractId: string,
  eventId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  await prisma.event.deleteMany({ where: { id: eventId, contractId } });
  refresh();
  return { error: null };
}

const datesSchema = z.object({
  commencementDate: z.preprocess(
    (value) => (value === "" ? null : value),
    isoDateField.nullable(),
  ),
  timeForCompletionDays: z.preprocess(
    (value) => (value === "" ? null : Number(value)),
    z.number().int().min(1).max(10_000).nullable(),
  ),
});

export async function saveContractDates(
  contractId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = datesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };

  await prisma.$transaction(async (tx) => {
    await tx.contract.update({ where: { id: contractId }, data: parsed.data });
    await recomputeContract(tx, contractId);
  });
  refresh();
  return { error: null };
}

const holidaySchema = z.object({
  date: isoDateField,
  name: z.string().trim().min(1).max(120),
});

export async function addHoliday(
  contractId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = holidaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalid" };

  await prisma.$transaction(async (tx) => {
    await tx.holiday.upsert({
      where: {
        contractId_date: { contractId, date: parsed.data.date },
      },
      create: { ...parsed.data, contractId },
      update: { name: parsed.data.name },
    });
    await recomputeContract(tx, contractId);
  });
  refresh();
  return { error: null };
}

export async function removeHoliday(
  contractId: string,
  holidayId: string,
  _state: FormState,
  _formData: FormData,
): Promise<FormState> {
  await prisma.$transaction(async (tx) => {
    await tx.holiday.deleteMany({ where: { id: holidayId, contractId } });
    await recomputeContract(tx, contractId);
  });
  refresh();
  return { error: null };
}
