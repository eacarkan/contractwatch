import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    DATABASE_URL_UNPOOLED: z.url().optional(),
    BLOB_STORE_ID: z.string().min(1).optional(),
    LLM_BASE_URL: z.url().optional(),
    LLM_API_KEY: z.string().min(1).optional(),
    LLM_MODEL: z.string().min(1).optional(),
    LLM_REASONING_EFFORT: z.string().min(1).optional(),
    VERCEL: z.string().optional(),
  })
  .refine((env) => !env.VERCEL || env.BLOB_STORE_ID, {
    path: ["BLOB_STORE_ID"],
    message: "is required on Vercel, because it names the private file store",
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
