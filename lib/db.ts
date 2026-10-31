import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { getEnv } from "@/lib/env";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }),
  });

// Keeps hot reload in development from exhausting connections.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
