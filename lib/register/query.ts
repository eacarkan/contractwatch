import "server-only";

import { prisma } from "@/lib/db";
import type { RegisterFilters } from "@/lib/register/filters";

export async function getRegisterRows(
  contractId: string,
  filters: RegisterFilters,
) {
  return prisma.obligation.findMany({
    where: {
      contractId,
      reviewStatus: filters.status ?? { in: ["CONFIRMED", "EDITED"] },
      obligor: filters.obligor,
      category: filters.category,
      isTimeBar: filters.timeBar ? filters.timeBar === "yes" : undefined,
    },
    orderBy: [{ clause: { orderIndex: "asc" } }, { createdAt: "asc" }],
    include: {
      deadlines: {
        where: { status: "OPEN" },
        orderBy: { dueOn: "asc" },
        take: 1,
        select: { dueOn: true },
      },
    },
  });
}

export type RegisterRow = Awaited<ReturnType<typeof getRegisterRows>>[number];
