/**
 * Scores extraction for a document against the hand-labelled gold set. Runs any
 * clauses not yet extracted first, unless --no-run is given.
 *
 *   pnpm eval <documentId> [--gold test/gold/ccag.json] [--set all|dev|holdout]
 *                          [--delay-ms 7000] [--no-run]
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { prisma } from "@/lib/db";
import {
  clausesInSubset,
  goldSetSchema,
  scoreExtraction,
  type GoldSubset,
} from "@/lib/llm/eval";
import {
  CURRENT_PROMPT,
  extractDocument,
  getModelConfig,
} from "@/lib/llm/extract";

const TARGETS = {
  recall: 0.9,
  precision: 0.8,
  periodMatch: 0.9,
  timeBarAccuracy: 0.95,
};

function format(value: number | null) {
  return value === null ? "n/a" : value.toFixed(2);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      gold: { type: "string", default: "test/gold/ccag.json" },
      set: { type: "string", default: "all" },
      "delay-ms": { type: "string", default: "0" },
      "no-run": { type: "boolean", default: false },
    },
  });

  const [documentId] = positionals;
  const subset = values.set as GoldSubset;
  if (!documentId || !["all", "dev", "holdout"].includes(subset)) {
    console.error(
      "Usage: pnpm eval <documentId> [--gold <file>] [--set all|dev|holdout] [--delay-ms 7000] [--no-run]",
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

  const gold = goldSetSchema.parse(
    JSON.parse(await readFile(values.gold, "utf8")),
  );

  if (!values["no-run"]) {
    const outcome = await extractDocument(documentId, {
      config,
      delayMs: Number(values["delay-ms"]),
      onBatch: (result) => {
        if (result.status === "NOTHING_LEFT") return;
        console.log(
          `${result.clauseRefs.join(", ")}: ${result.status}${result.error ? `. ${result.error}` : ""}`,
        );
      },
    });
    if (outcome === "UNAVAILABLE") {
      console.warn("The model service stopped answering; scoring what exists.");
    }
  }

  const runs = await prisma.extractionRun.findMany({
    where: {
      documentId,
      model: config.model,
      promptVersion: CURRENT_PROMPT.version,
    },
    include: { obligations: true },
  });
  const doneRuns = runs.filter((run) => run.status === "DONE");
  const extracted = new Set(doneRuns.flatMap((run) => run.clauseRefs));

  const wanted = clausesInSubset(gold, subset);
  const scored = new Set([...wanted].filter((ref) => extracted.has(ref)));

  const scores = scoreExtraction(
    gold.obligations.filter((item) => scored.has(item.clause_ref)),
    doneRuns
      .flatMap((run) => run.obligations)
      .filter((item) => scored.has(item.clauseRef))
      .map((item) => ({
        clause_ref: item.clauseRef,
        obligor: item.obligor,
        category: item.category,
        period_value: item.periodValue,
        period_basis: item.periodBasis,
        is_time_bar: item.isTimeBar,
        title: item.title,
      })),
  );

  console.log(`\nModel ${config.model}, prompt ${CURRENT_PROMPT.version}`);
  console.log(`Gold set ${values.gold}, subset ${subset}`);
  console.log(
    `Clauses scored: ${scored.size} of ${wanted.size} labelled in this subset`,
  );
  console.log(
    `Gold items ${scores.counts.gold}, predicted ${scores.counts.predicted}, matched ${scores.counts.matched}`,
  );
  console.log(
    `Batches: ${doneRuns.length} done, ${runs.length - doneRuns.length} failed or unfinished`,
  );
  console.log(
    `Tokens: ${runs.reduce((sum, run) => sum + (run.inputTokens ?? 0), 0)} in, ${runs.reduce((sum, run) => sum + (run.outputTokens ?? 0), 0)} out\n`,
  );

  console.log("| Metric | Result | Target |");
  console.log("|---|---|---|");
  console.log(
    `| Recall | ${format(scores.recall)} | ${format(TARGETS.recall)} |`,
  );
  console.log(
    `| Precision | ${format(scores.precision)} | ${format(TARGETS.precision)} |`,
  );
  console.log(
    `| Exact period match | ${format(scores.periodMatch)} | ${format(TARGETS.periodMatch)} |`,
  );
  console.log(
    `| Time-bar flag accuracy | ${format(scores.timeBarAccuracy)} | ${format(TARGETS.timeBarAccuracy)} |`,
  );

  if (scores.missed.length) {
    console.log("\nMissed:");
    for (const item of scores.missed) {
      console.log(
        `- ${item.clause_ref} ${item.obligor} ${item.category}: ${item.title}`,
      );
    }
  }
  if (scores.falsePositives.length) {
    console.log("\nNot in the gold set:");
    for (const item of scores.falsePositives) {
      console.log(
        `- ${item.clause_ref} ${item.obligor} ${item.category}: ${item.title}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
