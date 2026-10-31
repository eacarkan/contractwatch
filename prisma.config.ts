import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations need a direct connection. On Neon, DATABASE_URL is the pooled
    // string for the running app. An empty URL lets `prisma generate` run on a
    // fresh clone; migrate commands then fail with a connection error.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
