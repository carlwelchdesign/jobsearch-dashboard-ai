export type AgentActionPolicyKind =
  | "read_only"
  | "proposal"
  | "safe_internal"
  | "guarded_mutation"
  | "external_blocked";

export type ActionApproval = {
  approved: boolean;
  source: string;
  reason?: string;
};

export type ActionPolicyDecision = {
  allowed: boolean;
  kind: AgentActionPolicyKind;
  requiresApproval: boolean;
  reason: string;
};

export function evaluateActionPolicy(input: {
  kind: AgentActionPolicyKind;
  approval?: ActionApproval | null;
}): ActionPolicyDecision {
  if (input.kind === "external_blocked") {
    return {
      allowed: false,
      kind: input.kind,
      requiresApproval: true,
      reason: "External application submission, employer contact, email sending, calendar writes, and unreviewed publishing are blocked from autonomous execution.",
    };
  }

  if (input.kind === "guarded_mutation" && input.approval?.approved !== true) {
    return {
      allowed: false,
      kind: input.kind,
      requiresApproval: true,
      reason: "Guarded mutations require an explicit approval context before execution.",
    };
  }

  return {
    allowed: true,
    kind: input.kind,
    requiresApproval: input.kind === "guarded_mutation",
    reason: input.kind === "guarded_mutation"
      ? `Approved by ${input.approval?.source ?? "unknown approval source"}.`
      : "Action is allowed by the current Job Search OS policy.",
  };
}

export function assertActionPolicyAllowed(input: {
  kind: AgentActionPolicyKind;
  approval?: ActionApproval | null;
}) {
  const decision = evaluateActionPolicy(input);
  if (!decision.allowed) throw new Error(decision.reason);
  return decision;
}
