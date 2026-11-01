/**
 * Runs extraction for an uploaded document, resuming where the last run stopped.
 *
 *   pnpm extract <documentId> [--delay-ms 7000] [--limit 5] [--retry-failed]
 */
import { parseArgs } from "node:util";

import { prisma } from "@/lib/db";
import {
  CURRENT_PROMPT,
  extractDocument,
  getModelConfig,
} from "@/lib/llm/extract";

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "delay-ms": { type: "string", default: "0" },
      limit: { type: "string" },
      "retry-failed": { type: "boolean", default: false },
    },
  });

  const [documentId] = positionals;
  if (!documentId) {
    console.error(
      "Usage: pnpm extract <documentId> [--delay-ms 7000] [--limit 5] [--retry-failed]",
    );
    process.exitCode = 1;
    return;
  }

  const config = getModelConfig();
  if (!config) {
    console.error("Set LLM_BASE_URL and LLM_MODEL in .env. See .env.example.");
    process.exitCode = 1;
    return;
  }

  console.log(`Model ${config.model}, prompt ${CURRENT_PROMPT.version}`);
  const outcome = await extractDocument(documentId, {
    config,
    delayMs: Number(values["delay-ms"]),
    limit: values.limit ? Number(values.limit) : Infinity,
    retryFailed: values["retry-failed"],
    onBatch: (result) => {
      if (result.status === "NOTHING_LEFT") return;
      const refs = result.clauseRefs.join(", ");
      console.log(
        result.status === "DONE"
          ? `${refs}: ${result.obligations} obligations`
          : `${refs}: ${result.status}. ${result.error}`,
      );
    },
  });

  console.log(
    {
      NOTHING_LEFT: "Every clause has been dealt with.",
      LIMIT_REACHED: "Stopped at the limit. Run again to continue.",
      UNAVAILABLE: "The model service stopped answering. Run again later.",
      FAILED: "A batch failed again. See ExtractionRun.error.",
    }[outcome],
  );
  if (outcome === "UNAVAILABLE") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
