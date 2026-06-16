import { describe, expect, it } from "vitest";
import { evaluateActionPolicy } from "@/lib/agents/action-policy";

describe("evaluateActionPolicy", () => {
  it("allows read-only and proposal actions without approval", () => {
    expect(evaluateActionPolicy({ kind: "read_only" })).toMatchObject({
      allowed: true,
      requiresApproval: false,
    });
    expect(evaluateActionPolicy({ kind: "proposal" })).toMatchObject({
      allowed: true,
      requiresApproval: false,
    });
  });

  it("requires explicit approval for guarded mutations", () => {
    expect(evaluateActionPolicy({ kind: "guarded_mutation" })).toMatchObject({
      allowed: false,
      requiresApproval: true,
    });
    expect(evaluateActionPolicy({
      kind: "guarded_mutation",
      approval: { approved: true, source: "manual_confirmation" },
    })).toMatchObject({
      allowed: true,
      requiresApproval: true,
    });
  });

  it("blocks external actions from autonomous execution", () => {
    expect(evaluateActionPolicy({
      kind: "external_blocked",
      approval: { approved: true, source: "manual_confirmation" },
    })).toMatchObject({
      allowed: false,
      requiresApproval: true,
    });
  });
});
