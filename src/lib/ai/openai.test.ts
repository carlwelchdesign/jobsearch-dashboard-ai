import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OpenAI helper source contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/ai/openai.ts"), "utf8");

  it("lets structured output callers override the app-wide model", () => {
    expect(source).toContain("model?: string");
    expect(source).toContain("const resolvedModel = model?.trim() || process.env.OPENAI_MODEL || DEFAULT_MODEL");
    expect(source).toContain("model: resolvedModel");
  });

  it("keeps non-structured text generation on the app-wide model", () => {
    expect(source).toContain("export async function createTextResponse");
    expect(source).toContain("const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL");
  });
});
