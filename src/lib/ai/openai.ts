import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { traceAgentOperation } from "@/lib/observability/langsmith";

const DEFAULT_MODEL = "gpt-4.1-mini";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_OPENAI_TIMEOUT_MS = 25_000;

let client: OpenAI | null = null;

export function isOpenAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function parseStructuredOutput<TSchema extends z.ZodTypeAny>({
  schema,
  schemaName,
  system,
  input,
  model,
}: {
  schema: TSchema;
  schemaName: string;
  system: string;
  input: unknown;
  model?: string;
}): Promise<z.infer<TSchema> | null> {
  if (!isOpenAiConfigured()) return null;

  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const resolvedModel = model?.trim() || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const response = await withTimeout(traceAgentOperation(
    `openai.structured.${schemaName}`,
    {
      provider: "openai",
      operation: "responses.parse",
      model: resolvedModel,
      schemaName,
      inputKind: input == null ? "null" : Array.isArray(input) ? "array" : typeof input,
    },
    () => client!.responses.parse({
      model: resolvedModel,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        format: zodTextFormat(schema, schemaName),
      },
    }),
  ), openAiTimeoutMs(), `OpenAI structured output (${schemaName})`);

  return response.output_parsed;
}

export async function createEmbedding(input: string) {
  if (!isOpenAiConfigured()) return null;

  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const model = process.env.OPENAI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const response = await withTimeout(traceAgentOperation(
    "openai.embedding",
    {
      provider: "openai",
      operation: "embeddings.create",
      model,
      inputLength: input.length,
      truncatedLength: Math.min(input.length, 8000),
    },
    () => client!.embeddings.create({
      model,
      input: input.slice(0, 8000),
    }),
  ), openAiTimeoutMs(), "OpenAI embedding");

  return {
    model: response.model,
    vector: response.data[0]?.embedding ?? [],
  };
}

export async function createTextResponse({
  system,
  input,
}: {
  system: string;
  input: string;
}) {
  if (!isOpenAiConfigured()) return null;

  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const response = await withTimeout(traceAgentOperation(
    "openai.text_response",
    {
      provider: "openai",
      operation: "responses.create",
      model,
      inputLength: input.length,
    },
    () => client!.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: input },
      ],
    }),
  ), openAiTimeoutMs(), "OpenAI text response");

  return response.output_text?.trim() || null;
}

export async function createImageGeneration({
  prompt,
  model = "gpt-image-2",
  size = "1536x864",
  quality = "medium",
}: {
  prompt: string;
  model?: string;
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
}) {
  if (!isOpenAiConfigured()) return null;

  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const resolvedModel = model.trim() || "gpt-image-2";
  const response = await withTimeout(traceAgentOperation(
    "openai.image_generation",
    {
      provider: "openai",
      operation: "images.generate",
      model: resolvedModel,
      size,
      quality,
      promptLength: prompt.length,
    },
    () => client!.images.generate({
      model: resolvedModel,
      prompt,
      size,
      quality,
      output_format: "png",
      background: "opaque",
      moderation: "auto",
    }),
  ), Math.max(openAiTimeoutMs(), 120_000), "OpenAI image generation");

  const base64 = response.data?.[0]?.b64_json;
  if (!base64) return null;
  return {
    model: resolvedModel,
    size,
    quality,
    mimeType: "image/png" as const,
    buffer: Buffer.from(base64, "base64"),
  };
}

function openAiTimeoutMs() {
  const value = Number(process.env.OPENAI_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_OPENAI_TIMEOUT_MS;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
