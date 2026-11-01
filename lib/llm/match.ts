import "server-only";

import { ZodError } from "zod";

import { senderMatches } from "@/lib/correspondence/service";
import { isoDate } from "@/lib/deadline";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createModelClient, ModelOutputError } from "@/lib/llm/client";
import { getModelConfig } from "@/lib/llm/extract";
import { corrV1 } from "@/lib/llm/prompts/corr-v1";
import {
  MATCH_TOOL,
  matchSchema,
  type MatchResult,
} from "@/lib/llm/schemas/match";

export type Suggestion = MatchResult["matches"][number] & {
  clauseRef: string;
  title: string;
};

export type SuggestResult =
  | { ok: true; summary: string; suggestions: Suggestion[] }
  | { ok: false; error: "noModel" | "notFound" | "failed" };

/**
 * Nothing is written to a link here: a suggestion becomes one only when the user
 * confirms it. The call itself is recorded as one ExtractionRun.
 */
export async function suggestLinks(
  contractId: string,
  correspondenceId: string,
  uiLanguage: string,
): Promise<SuggestResult> {
  const config = getModelConfig();
  if (!config) return { ok: false, error: "noModel" };

  const letter = await prisma.correspondence.findFirst({
    where: { id: correspondenceId, contractId },
  });
  if (!letter) return { ok: false, error: "notFound" };

  const register = await prisma.obligation.findMany({
    where: { contractId, reviewStatus: { in: ["CONFIRMED", "EDITED"] } },
    select: {
      id: true,
      clauseRef: true,
      obligor: true,
      category: true,
      title: true,
      triggerEvent: true,
    },
  });

  const run = await prisma.extractionRun.create({
    data: {
      contractId,
      status: "RUNNING",
      model: config.model,
      promptVersion: corrV1.version,
      clauseRefs: [],
    },
  });

  let rawOutput: unknown;
  try {
    const response = await createModelClient(config)({
      system: corrV1.system(uiLanguage),
      user: corrV1.user(
        { ...letter, sentOn: isoDate(letter.sentOn) },
        register,
      ),
      tool: MATCH_TOOL,
    });
    rawOutput = response.rawOutput;
    const parsed = matchSchema.parse(response.input);

    await prisma.extractionRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        rawOutput: rawOutput as Prisma.InputJsonValue,
      },
    });

    const byId = new Map(register.map((row) => [row.id, row]));
    const suggestions = parsed.matches.flatMap((match): Suggestion[] => {
      const row = byId.get(match.obligation_id);
      if (!row) return [];
      // The model is told this rule, but the code is what holds it.
      const canSatisfy =
        letter.direction === "OUT" &&
        senderMatches(letter.fromParty, row.obligor);
      return [
        {
          ...match,
          relation:
            match.relation === "SATISFIES" && !canSatisfy
              ? "REFERS_TO"
              : match.relation,
          clauseRef: row.clauseRef,
          title: row.title,
        },
      ];
    });
    return { ok: true, summary: parsed.summary, suggestions };
  } catch (error) {
    if (error instanceof ModelOutputError) rawOutput = error.rawOutput;
    await prisma.extractionRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        rawOutput: (rawOutput ?? undefined) as
          Prisma.InputJsonValue | undefined,
        error:
          error instanceof ZodError
            ? `Failed validation: ${JSON.stringify(error.issues).slice(0, 2000)}`
            : error instanceof Error
              ? error.message
              : String(error),
      },
    });
    return { ok: false, error: "failed" };
  }
}
