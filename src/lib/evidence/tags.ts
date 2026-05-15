const tagDictionary: Array<{ tag: string; patterns: RegExp[] }> = [
  { tag: "react", patterns: [/\breact\b/i] },
  { tag: "typescript", patterns: [/\btypescript\b/i, /\bts\b/i] },
  { tag: "nextjs", patterns: [/\bnext\.?js\b/i] },
  { tag: "full-stack", patterns: [/\bfull[- ]?stack\b/i, /\bnode\.?js\b/i] },
  { tag: "security", patterns: [/\bsecurity\b/i, /\bsaas security\b/i, /\bpasskeys?\b/i, /\bwebauthn\b/i] },
  { tag: "identity", patterns: [/\bidentity\b/i, /\bauth\b/i, /\bauthentication\b/i, /\bauthorization\b/i, /\bpasskeys?\b/i, /\bwebauthn\b/i] },
  { tag: "webauthn", patterns: [/\bwebauthn\b/i, /\bpasskeys?\b/i] },
  { tag: "design-systems", patterns: [/\bdesign systems?\b/i, /\bstorybook\b/i, /\bcomponent librar/i] },
  { tag: "testing", patterns: [/\btesting\b/i, /\bjest\b/i, /\bplaywright\b/i, /\bmsw\b/i] },
  { tag: "ai-product", patterns: [/\bai\b/i, /\bopenai\b/i, /\bllm\b/i, /\bagents?\b/i, /\bstructured outputs?\b/i] },
  { tag: "developer-tools", patterns: [/\bdeveloper tools?\b/i, /\bdevtools?\b/i, /\bdx\b/i] },
  { tag: "internal-tools", patterns: [/\binternal tools?\b/i, /\badmin\b/i, /\bworkflow\b/i] },
  { tag: "data-visualization", patterns: [/\bvisualization\b/i, /\bdashboard\b/i, /\bdata-rich\b/i] },
  { tag: "defense-tech", patterns: [/\bdefense\b/i, /\bmission software\b/i, /\boperator tools?\b/i] },
  { tag: "saas", patterns: [/\bsaas\b/i, /\benterprise\b/i] },
];

export function inferEvidenceTags(...values: Array<string | null | undefined>) {
  const haystack = values.filter(Boolean).join(" ");
  return tagDictionary
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(haystack)))
    .map((entry) => entry.tag);
}

export function normalizeTags(tags: unknown) {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}
