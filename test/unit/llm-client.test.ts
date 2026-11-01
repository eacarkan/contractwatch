import { describe, expect, it } from "vitest";

import {
  createModelClient,
  ModelOutputError,
  ModelRequestError,
  readToolResponse,
} from "@/lib/llm/client";

const TOOL = { name: "record", description: "Records.", parameters: {} };
const REQUEST = { system: "System", user: "User", tool: TOOL };
const CONFIG = { baseUrl: "http://model.test/v1/", model: "test-model" };

function toolCall(args: string, extra: object = {}) {
  return {
    choices: [
      {
        finish_reason: "tool_calls",
        message: {
          content: null,
          tool_calls: [{ function: { name: "record", arguments: args } }],
        },
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 3 },
    ...extra,
  };
}

function textReply(content: string) {
  return { choices: [{ message: { content } }] };
}

describe("readToolResponse", () => {
  it("reads the tool call and the token counts", () => {
    const response = readToolResponse(toolCall('{"a":1}'), "record");
    expect(response.input).toEqual({ a: 1 });
    expect(response.inputTokens).toBe(12);
    expect(response.outputTokens).toBe(3);
  });

  it("accepts JSON returned as text, fenced or not", () => {
    expect(readToolResponse(textReply('{"a":1}'), "record").input).toEqual({
      a: 1,
    });
    expect(
      readToolResponse(textReply('Here:\n```json\n{"a":1}\n```'), "record")
        .input,
    ).toEqual({ a: 1 });
  });

  it.each([
    ["an unknown shape", { error: "no" }],
    ["an empty reply", textReply("")],
    ["text that is not JSON", textReply("I cannot help.")],
    [
      "a reply cut off at its limit",
      {
        choices: [{ finish_reason: "length", message: { content: '{"a":' } }],
      },
    ],
  ])("rejects %s and keeps the raw output", (_name, raw) => {
    expect(() => readToolResponse(raw, "record")).toThrow(ModelOutputError);
  });
});

describe("createModelClient", () => {
  it("posts to the chat endpoint, with a key only when one is set", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return Response.json(toolCall("{}"));
    }) as typeof fetch;

    await createModelClient(CONFIG, { fetchFn })(REQUEST);
    await createModelClient(
      { ...CONFIG, apiKey: "secret" },
      { fetchFn },
    )(REQUEST);

    expect(seen[0]!.url).toBe("http://model.test/v1/chat/completions");
    expect(seen[0]!.init.headers).not.toHaveProperty("authorization");
    expect(seen[1]!.init.headers).toHaveProperty(
      "authorization",
      "Bearer secret",
    );
    expect(JSON.parse(seen[0]!.init.body as string).model).toBe("test-model");
  });

  it("waits and retries when rate limited, using the service's own delay", async () => {
    const waits: number[] = [];
    const responses = [
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": "7" },
      }),
      Response.json(toolCall('{"a":1}')),
    ];
    const client = createModelClient(CONFIG, {
      fetchFn: (async () => responses.shift()!) as typeof fetch,
      sleep: async (ms) => waits.push(ms),
    });

    expect((await client(REQUEST)).input).toEqual({ a: 1 });
    expect(waits).toEqual([7000]);
  });

  it("gives up after its retries, and at once on an error retrying cannot fix", async () => {
    let calls = 0;
    const respondWith = (status: number) =>
      createModelClient(CONFIG, {
        fetchFn: (async () => {
          calls++;
          return new Response("quota", { status });
        }) as typeof fetch,
        sleep: async () => undefined,
      });

    await expect(respondWith(429)(REQUEST)).rejects.toThrow(ModelRequestError);
    expect(calls).toBe(4);

    calls = 0;
    await expect(respondWith(401)(REQUEST)).rejects.toThrow(/401/);
    expect(calls).toBe(1);
  });

  it("reports a service it cannot reach", async () => {
    const client = createModelClient(CONFIG, {
      fetchFn: (async () => {
        throw new Error("connection refused");
      }) as typeof fetch,
    });
    await expect(client(REQUEST)).rejects.toThrow(ModelRequestError);
  });
});
