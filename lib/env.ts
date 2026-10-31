import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    DATABASE_URL_UNPOOLED: z.url().optional(),
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    VERCEL: z.string().optional(),
  })
  .refine((env) => !env.VERCEL || env.BLOB_READ_WRITE_TOKEN, {
    path: ["BLOB_READ_WRITE_TOKEN"],
    message: "is required on Vercel, because it issues client upload tokens",
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables:\n${problems}\nSee .env.example.`,
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** Called from instrumentation.ts, so a missing variable stops the server at boot. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
