import { AgentType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { skillRegistry } from "@/lib/skills/registry";

describe("skill registry", () => {
  it("covers every agent type with a code-first skill", () => {
    const registeredAgentTypes = new Set(
      Object.values(skillRegistry)
        .map((skill) => "agentType" in skill ? skill.agentType : undefined)
        .filter(Boolean),
    );

    expect(registeredAgentTypes).toEqual(new Set(Object.values(AgentType)));
  });

  it("keeps external submission out of auto-run policy", () => {
    expect(skillRegistry.prepare_application_packet.defaultPolicy.externalAction).toBe("manual_submit_required");
    expect(skillRegistry.recruiter_intelligence.defaultPolicy.externalAction).toBe("draft_only");
    expect(skillRegistry.approve_agency_match.defaultPolicy.autoApplyLearningKinds).not.toContain("ACTION_POLICY");
  });
});
