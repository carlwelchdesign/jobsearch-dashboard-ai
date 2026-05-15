import { describe, expect, it } from "vitest";
import { cosineSimilarity, numericVector, pgVectorLiteral } from "@/lib/evidence/embeddings";

describe("evidence embeddings", () => {
  it("calculates cosine similarity for matching vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
  });

  it("filters non-numeric vector values", () => {
    expect(numericVector([1, "x", Number.NaN, 2])).toEqual([1, 2]);
  });

  it("formats sanitized pgvector literals", () => {
    expect(pgVectorLiteral([1, Number.NaN, 0.25, Infinity, -0.5])).toBe("[1,0.25,-0.5]");
  });
});
