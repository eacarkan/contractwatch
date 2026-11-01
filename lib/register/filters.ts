import { z } from "zod";

import { ObligationCategory, PartyRole } from "@/lib/generated/prisma/enums";

/** An unrecognised filter value is ignored, so an old link still opens. */
const filtersSchema = z.object({
  obligor: z.enum(PartyRole).optional().catch(undefined),
  category: z.enum(ObligationCategory).optional().catch(undefined),
  timeBar: z.enum(["yes", "no"]).optional().catch(undefined),
  status: z.enum(["CONFIRMED", "EDITED"]).optional().catch(undefined),
});

export type RegisterFilters = z.infer<typeof filtersSchema>;

export function parseFilters(
  input: Record<string, string | string[] | undefined>,
): RegisterFilters {
  return filtersSchema.parse(input);
}

export function filtersToQuery(filters: RegisterFilters) {
  return new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value) as [string, string][],
  ).toString();
}
