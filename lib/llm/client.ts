import { z } from "zod";

/**
 * Any service with an OpenAI-compatible chat endpoint will do, including the free
 * tiers and a model running on this computer, so changing service is a change of
 * environment variables only.
 */
export type ModelConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** "none" stops a local thinking model spending its time budget before it answers. */
  reasoningEffort?: string;
};

export type ToolRequest = {
  system: string;
  user: string;
  tool: { name: string; description: string; parameters: object };
};

export type ToolResponse = {
  input: unknown;
  rawOutput: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type CallModel = (request: ToolRequest) => Promise<ToolResponse>;

/** The service could not answer, so the same batch may succeed if tried later. */
export class ModelRequestError extends Error {
  override name = "ModelRequestError";
}

/** The service answered with something that is not a usable tool call. */
export class ModelOutputError extends Error {
  override name = "ModelOutputError";
  constructor(
    message: string,
    readonly rawOutput: unknown,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 240_000;
const MAX_OUTPUT_TOKENS = 16_000;
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                function: z.object({ name: z.string(), arguments: z.string() }),
              }),
            )
            .nullish(),
        }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
    })
    .nullish(),
});

/** Models that ignore the forced tool call often return the JSON as text, fenced or not. */
function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced?.[1] ?? text);
}

export function readToolResponse(raw: unknown, toolName: string): ToolResponse {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ModelOutputError("Unexpected response shape.", raw);
  }

  const [choice] = parsed.data.choices;
  if (choice!.finish_reason === "length") {
    throw new ModelOutputError("The response was cut off at its limit.", raw);
  }

  const call = choice!.message.tool_calls?.find(
    ({ function: fn }) => fn.name === toolName,
  );
  const text = call?.function.arguments ?? choice!.message.content;
  if (!text) throw new ModelOutputError("The response was empty.", raw);

  try {
    return {
      input: parseJson(text),
      rawOutput: raw,
      inputTokens: parsed.data.usage?.prompt_tokens ?? null,
      outputTokens: parsed.data.usage?.completion_tokens ?? null,
    };
  } catch {
    throw new ModelOutputError("The response was not valid JSON.", raw);
  }
}

function retryDelay(response: Response, attempt: number) {
  const seconds = Number(response.headers.get("retry-after"));
  return seconds > 0 ? seconds * 1000 : RETRY_DELAYS_MS[attempt]!;
}

export function createModelClient(
  config: ModelConfig,
  {
    fetchFn = fetch,
    sleep = (ms: number) => new Promise((done) => setTimeout(done, ms)),
  }: {
    fetchFn?: typeof fetch;
    sleep?: (ms: number) => Promise<unknown>;
  } = {},
): CallModel {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  return async ({ system, user, tool }) => {
    const body = JSON.stringify({
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      // Keeps two runs of the same prompt comparable.
      temperature: 0,
      ...(config.reasoningEffort && {
        reasoning_effort: config.reasoningEffort,
      }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [{ type: "function", function: tool }],
      tool_choice: { type: "function", function: { name: tool.name } },
    });

    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetchFn(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.apiKey && {
              authorization: `Bearer ${config.apiKey}`,
            }),
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        throw new ModelRequestError(
          `Could not reach the model service: ${(error as Error).message}`,
        );
      }

      if (response.ok) {
        const raw: unknown = await response.json().catch(() => null);
        return readToolResponse(raw, tool.name);
      }

      if (
        RETRYABLE_STATUSES.has(response.status) &&
        attempt < RETRY_DELAYS_MS.length
      ) {
        await sleep(retryDelay(response, attempt));
        continue;
      }

      const detail = (await response.text().catch(() => "")).slice(0, 500);
      throw new ModelRequestError(
        `The model service returned ${response.status}: ${detail}`,
      );
    }
  };
}
