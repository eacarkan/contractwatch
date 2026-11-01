import "server-only";

import { ZodError } from "zod";

import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import type { Prisma } from "@/lib/generated/prisma/client";
import { nextBatch } from "@/lib/llm/batches";
import {
  createModelClient,
  ModelOutputError,
  ModelRequestError,
  type CallModel,
  type ModelConfig,
} from "@/lib/llm/client";
import { parseExtraction, type CheckedObligation } from "@/lib/llm/parse";
import { CURRENT_PROMPT } from "@/lib/llm/prompts";
import { OBLIGATIONS_TOOL } from "@/lib/llm/schemas/obligation";
import { PREAMBLE_REF } from "@/lib/text/split-clauses";

/** Marks a failed run whose batch is worth trying again without being asked. */
const REQUEST_ERROR_PREFIX = "model-request:";

export function getModelConfig(): ModelConfig | null {
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_REASONING_EFFORT } =
    getEnv();
  if (!LLM_BASE_URL || !LLM_MODEL) return null;
  return {
    baseUrl: LLM_BASE_URL,
    apiKey: LLM_API_KEY,
    model: LLM_MODEL,
    reasoningEffort: LLM_REASONING_EFFORT,
  };
}

export type BatchResult =
  | { status: "NOTHING_LEFT" }
  | {
      status: "DONE" | "FAILED" | "UNAVAILABLE";
      runId: string;
      clauseRefs: string[];
      obligations: number;
      error?: string;
    };

/**
 * The clauses no run has dealt with yet for this prompt and model. A batch the
 * model answered badly stays out until retryFailed is set, so that one bad batch
 * cannot repeat for ever and use up a free daily quota.
 */
async function pendingClauses(
  documentId: string,
  model: string,
  retryFailed: boolean,
  keepOtherModels: boolean,
) {
  const [clauses, runs] = await Promise.all([
    prisma.clause.findMany({
      where: { documentId, NOT: { clauseRef: PREAMBLE_REF } },
      orderBy: { orderIndex: "asc" },
    }),
    prisma.extractionRun.findMany({
      where: {
        documentId,
        promptVersion: CURRENT_PROMPT.version,
        status: { in: ["DONE", "FAILED"] },
        OR: [
          { model },
          ...(keepOtherModels ? [{ status: "DONE" as const }] : []),
        ],
      },
      select: { status: true, clauseRefs: true, error: true },
    }),
  ]);

  const settled = new Set(
    runs
      .filter(
        (run) =>
          run.status === "DONE" ||
          (!retryFailed && !run.error?.startsWith(REQUEST_ERROR_PREFIX)),
      )
      .flatMap((run) => run.clauseRefs),
  );

  return clauses.filter(
    (clause) => clause.body.trim() && !settled.has(clause.clauseRef),
  );
}

function obligationRow(
  obligation: CheckedObligation,
  ids: {
    contractId: string;
    runId: string;
    clauseIds: Map<string, string>;
  },
): Prisma.ObligationCreateManyInput {
  return {
    contractId: ids.contractId,
    runId: ids.runId,
    clauseId: ids.clauseIds.get(obligation.clause_ref) ?? null,
    clauseRef: obligation.clause_ref,
    obligor: obligation.obligor,
    counterparty: obligation.counterparty ?? null,
    category: obligation.category,
    title: obligation.title,
    description: obligation.description,
    triggerType: obligation.trigger_type,
    triggerEvent: obligation.trigger_event ?? null,
    periodValue: obligation.period_value ?? null,
    periodBasis: obligation.period_basis ?? null,
    periodDirection: obligation.period_direction ?? "AFTER",
    recurrenceDays: obligation.recurrence_days ?? null,
    isTimeBar: obligation.is_time_bar,
    consequence: obligation.consequence ?? null,
    sourceQuote: obligation.source_quote,
    confidence: obligation.confidence,
    reviewNote: obligation.flags.join(", ") || null,
  };
}

function describeFailure(error: unknown) {
  if (error instanceof ZodError) {
    return `Failed validation: ${JSON.stringify(error.issues).slice(0, 2000)}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Sends the next batch to the model, recording it as one ExtractionRun. */
export async function runNextBatch(
  documentId: string,
  {
    config,
    callModel = createModelClient(config),
    retryFailed = false,
    keepOtherModels = false,
  }: {
    config: ModelConfig;
    callModel?: CallModel;
    retryFailed?: boolean;
    keepOtherModels?: boolean;
  },
): Promise<BatchResult> {
  const pending = await pendingClauses(
    documentId,
    config.model,
    retryFailed,
    keepOtherModels,
  );
  const batch = nextBatch(pending);
  if (batch.length === 0) return { status: "NOTHING_LEFT" };

  const { contract } = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    select: {
      contract: {
        select: { id: true, name: true, type: true, language: true },
      },
    },
  });
  const clauseRefs = batch.map((clause) => clause.clauseRef);

  const run = await prisma.extractionRun.create({
    data: {
      documentId,
      status: "RUNNING",
      model: config.model,
      promptVersion: CURRENT_PROMPT.version,
      clauseRefs,
    },
  });

  let usage: { inputTokens?: number | null; outputTokens?: number | null } = {};
  let rawOutput: unknown;

  try {
    const response = await callModel({
      system: CURRENT_PROMPT.system(contract),
      user: CURRENT_PROMPT.user(contract, batch),
      tool: OBLIGATIONS_TOOL,
    });
    rawOutput = response.rawOutput;
    usage = response;

    const obligations = parseExtraction(response.input, batch);
    const clauseIds = new Map(
      batch.map((clause) => [clause.clauseRef, clause.id]),
    );

    await prisma.$transaction([
      prisma.obligation.createMany({
        data: obligations.map((obligation) =>
          obligationRow(obligation, {
            contractId: contract.id,
            runId: run.id,
            clauseIds,
          }),
        ),
      }),
      prisma.extractionRun.update({
        where: { id: run.id },
        data: {
          status: "DONE",
          finishedAt: new Date(),
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          rawOutput: rawOutput as Prisma.InputJsonValue,
        },
      }),
    ]);

    return {
      status: "DONE",
      runId: run.id,
      clauseRefs,
      obligations: obligations.length,
    };
  } catch (error) {
    if (error instanceof ModelOutputError) rawOutput = error.rawOutput;
    const unavailable = error instanceof ModelRequestError;
    const message = describeFailure(error);

    await prisma.extractionRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        rawOutput: (rawOutput ?? undefined) as
          Prisma.InputJsonValue | undefined,
        error: unavailable ? `${REQUEST_ERROR_PREFIX} ${message}` : message,
      },
    });

    return {
      status: unavailable ? "UNAVAILABLE" : "FAILED",
      runId: run.id,
      clauseRefs,
      obligations: 0,
      error: message,
    };
  }
}

/**
 * Works through a document on this computer, pausing between batches to stay
 * inside a free service's rate limit. Stops if the service stops answering, since
 * a used-up daily quota would otherwise fail every remaining batch.
 */
export async function extractDocument(
  documentId: string,
  {
    config,
    delayMs = 0,
    limit = Infinity,
    retryFailed = false,
    keepOtherModels = false,
    onBatch,
  }: {
    config: ModelConfig;
    delayMs?: number;
    limit?: number;
    retryFailed?: boolean;
    keepOtherModels?: boolean;
    onBatch?: (result: BatchResult) => void;
  },
) {
  const attempted = new Set<string>();

  for (let count = 0; count < limit; count++) {
    if (count > 0 && delayMs > 0) {
      await new Promise((done) => setTimeout(done, delayMs));
    }

    const result = await runNextBatch(documentId, {
      config,
      retryFailed,
      keepOtherModels,
    });
    if (result.status === "NOTHING_LEFT") return result.status;
    onBatch?.(result);
    if (result.status === "UNAVAILABLE") return result.status;

    // With retryFailed, a batch that fails again would otherwise come straight back.
    const repeated = result.clauseRefs.some((ref) => attempted.has(ref));
    if (repeated && result.status === "FAILED") return result.status;
    result.clauseRefs.forEach((ref) => attempted.add(ref));
  }

  return "LIMIT_REACHED" as const;
}
