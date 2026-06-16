import { z } from "zod";
import { parseStructuredOutput } from "@/lib/ai/openai";
import type { ResumeExperienceContext } from "@/lib/resumes/resume-context";
import { inferVersionSuggestions } from "@/lib/resumes/version-inference";

export const roleDescriptionBulletDigestSchema = z.object({
  bullets: z.array(z.object({
    text: z.string().min(10),
    keywords: z.array(z.string()).default([]),
    sourceExcerpt: z.string().min(10),
    confidenceNotes: z.string().default("Supported by pasted role description."),
  })).min(0).max(8),
  warnings: z.array(z.string()).default([]),
});

export type RoleDescriptionBulletDigest = z.infer<typeof roleDescriptionBulletDigestSchema>;

export type DigestRoleDescriptionInput = {
  company?: string | null;
  role?: string | null;
  category?: string | null;
  description: string;
  focusAreas?: string | null;
};

export type RoleDescriptionMetadata = {
  company: string;
  role: string;
  category: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  summary: string | null;
  skills: string[];
  achievements: string[];
  resumeContext: ResumeExperienceContext;
};

export async function digestRoleDescriptionToBullets(input: DigestRoleDescriptionInput): Promise<RoleDescriptionBulletDigest> {
  const fallback = buildDeterministicDigest(input);

  try {
    const generated = await parseStructuredOutput({
      schema: roleDescriptionBulletDigestSchema,
      schemaName: "digest_role_description_bullets",
      system:
        "Turn a pasted role or job description into proposed resume bullets for the candidate's own matching past role. " +
        "Use only facts supported by the pasted text. Do not invent metrics, company names, tools, team sizes, outcomes, or responsibilities. " +
        "Every bullet must be concise, action/result oriented, and directly supported by sourceExcerpt copied or closely paraphrased from the pasted text. " +
        "If the text is generic, produce generic supported bullets and add warnings. Return 3-8 bullets when possible.",
      input,
    });
    const clean = normalizeDigest(generated, input.description);
    if (clean.bullets.length) return clean;
  } catch (error) {
    console.warn("Role description bullet digest failed; using deterministic fallback.", error);
  }

  return fallback;
}

export function inferRoleDescriptionMetadata(input: DigestRoleDescriptionInput): RoleDescriptionMetadata {
  const lines = input.description
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const role = input.role?.trim() || firstLikelyRoleLine(lines) || "Role from pasted description";
  const company = input.company?.trim() || firstLikelyCompanyLine(lines) || "Company from pasted description";
  const category = input.category?.trim() || inferCategoryFromText(`${input.description} ${input.focusAreas ?? ""}`);
  const dateLine = lines.find(looksLikeDateLine) ?? null;
  const dates = parseDateRange(dateLine);
  const summary = firstSummaryLine(lines);
  const skills = extractKeywords(input.description);
  const achievements = extractCandidateSentences(input.description).slice(0, 10);
  return {
    company,
    role,
    category,
    location: lines.find(looksLikeLocationLine) ?? null,
    startDate: dates.startDate,
    endDate: dates.endDate,
    isCurrent: dates.isCurrent,
    summary,
    skills,
    achievements,
    resumeContext: {
      applicationTitle: inferApplicationTitle(lines),
      applicationSummary: summary ?? undefined,
      users: inferUsers(input.description),
      scaleImpact: inferScaleImpact(input.description),
      confirmedTech: [],
      versionSuggestions: inferVersionSuggestions({
        technologies: skills,
        startDate: dates.startDate,
        endDate: dates.endDate,
        isCurrent: dates.isCurrent,
        sourceText: input.description,
      }),
    },
  };
}

export function buildDeterministicDigest(input: DigestRoleDescriptionInput): RoleDescriptionBulletDigest {
  const sentences = extractCandidateSentences(input.description);
  const focusTerms = splitTerms(input.focusAreas ?? "");
  const ranked = sentences
    .map((sentence) => ({ sentence, score: sentenceScore(sentence, focusTerms) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  const bullets = uniqueByText(ranked.map(({ sentence }) => ({
    text: resumeBulletFromSentence(sentence),
    keywords: extractKeywords(`${sentence} ${input.focusAreas ?? ""}`),
    sourceExcerpt: sentence,
    confidenceNotes: "Generated deterministically from pasted role description; review before verifying.",
  }))).slice(0, 8);

  const warnings = [];
  if (bullets.length < 3) warnings.push("The pasted text was sparse, so fewer than three supported bullet proposals were created.");
  if (!hasMetric(input.description)) warnings.push("No explicit metrics were found; proposed bullets avoid invented numbers.");

  return { bullets, warnings };
}

function normalizeDigest(value: RoleDescriptionBulletDigest | null, sourceText: string): RoleDescriptionBulletDigest {
  if (!value) return { bullets: [], warnings: [] };
  const normalizedSource = normalizeForSupport(sourceText);
  const bullets = uniqueByText(value.bullets
    .map((bullet) => ({
      text: cleanBulletText(bullet.text),
      keywords: uniqueStrings(bullet.keywords.map((keyword) => keyword.trim()).filter(Boolean)).slice(0, 12),
      sourceExcerpt: bullet.sourceExcerpt.trim(),
      confidenceNotes: bullet.confidenceNotes.trim() || "Supported by pasted role description.",
    }))
    .filter((bullet) => bullet.text.length >= 10 && bullet.sourceExcerpt.length >= 10)
    .filter((bullet) => isSupportedExcerpt(bullet.sourceExcerpt, normalizedSource)))
    .slice(0, 8);

  const warnings = [...value.warnings];
  if (bullets.length < value.bullets.length) warnings.push("Some generated bullets were dropped because their source excerpt was not found in the pasted description.");
  if (!hasMetric(sourceText)) warnings.push("No explicit metrics were found; proposed bullets avoid invented numbers.");

  return { bullets, warnings: uniqueStrings(warnings) };
}

function extractCandidateSentences(text: string) {
  return uniqueStrings(
    text
      .replace(/\r/g, "")
      .replace(/[•*]\s+/g, "\n")
      .split(/\n|(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((line) => line.replace(/^[-–—\s]+/, "").replace(/\s+/g, " ").trim())
      .filter((line) => line.length >= 35)
      .filter((line) => !/^(about|benefits|salary|compensation|location|equal opportunity)\b/i.test(line)),
  );
}

function firstLikelyRoleLine(lines: string[]) {
  return lines.find((line) => {
    if (line.includes("·")) return false;
    if (looksLikeDateLine(line) || looksLikeLocationLine(line)) return false;
    return /\b(engineer|developer|architect|manager|lead|director|designer|consultant|specialist|analyst)\b/i.test(line);
  }) ?? null;
}

function firstLikelyCompanyLine(lines: string[]) {
  const linkedInCompany = lines.find((line) => line.includes("·"));
  if (linkedInCompany) return linkedInCompany.split("·")[0]?.trim() || null;
  return lines.find((line) => {
    if (looksLikeDateLine(line) || looksLikeLocationLine(line)) return false;
    if (/\b(engineer|developer|architect|manager|lead|director|designer|consultant|specialist|analyst)\b/i.test(line)) return false;
    return /^[A-Z0-9][A-Za-z0-9 .,&'-]{1,60}$/.test(line);
  }) ?? null;
}

function inferCategoryFromText(text: string) {
  const normalized = text.toLowerCase();
  if (/\b(ai|ml|machine learning|llm|agent|guided selling|analytics)\b/.test(normalized)) return "ai";
  if (/\b(security|identity|auth|webauthn|passkey)\b/.test(normalized)) return "security";
  if (/\b(test|qa|playwright|jest|vitest)\b/.test(normalized)) return "testing";
  if (/\b(design system|component library|storybook)\b/.test(normalized)) return "design_systems";
  if (/\b(node|hapi|lambda|mysql|api|backend|full.?stack)\b/.test(normalized)) return "fullstack";
  if (/\b(saas|sales engagement|sales operations)\b/.test(normalized)) return "saas";
  return "frontend";
}

function looksLikeDateLine(value: string) {
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}|present)\b/i.test(value) && /\b(?:yr|yrs|mos|month|months|\d{4})\b/i.test(value);
}

function looksLikeLocationLine(value: string) {
  return /\b(area|metropolitan|remote|united states|canada|los angeles|new york|san francisco|austin|seattle|denver|chicago)\b/i.test(value);
}

function parseDateRange(value: string | null) {
  if (!value) return { startDate: null, endDate: null, isCurrent: false };
  const mainRange = value.split("·")[0]?.trim() ?? value.trim();
  const [startDate, endDate] = mainRange.split(/\s+-\s+/).map((part) => part?.trim() || null);
  return {
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    isCurrent: /present|current/i.test(endDate ?? ""),
  };
}

function firstSummaryLine(lines: string[]) {
  return lines.find((line) => (
    line.length >= 80
    && !line.startsWith("•")
    && !looksLikeDateLine(line)
    && !looksLikeLocationLine(line)
  )) ?? null;
}

function inferApplicationTitle(lines: string[]) {
  const quoted = lines.find((line) => /^["“].+["”]$/.test(line) && line.length <= 90);
  if (quoted) return quoted.replace(/^["“]|["”]$/g, "").trim();
  const productLine = lines.find((line) => (
    line.length <= 90
    && /\b(app|application|platform|portal|dashboard|system|tool|workflow|product|service)\b/i.test(line)
    && !looksLikeDateLine(line)
    && !looksLikeLocationLine(line)
    && !/\b(engineer|developer|architect|manager|lead|director)\b/i.test(line)
  ));
  return productLine ?? undefined;
}

function inferUsers(text: string) {
  const sentence = extractCandidateSentences(text).find((line) => /\b(users?|customers?|clients?|sales reps?|teams?|engineers?|operators?|admins?)\b/i.test(line));
  return sentence ? trimContextSentence(sentence) : undefined;
}

function inferScaleImpact(text: string) {
  const sentence = extractCandidateSentences(text).find((line) => (
    hasMetric(line)
    || /\b(scale|scalable|performance|latency|throughput|reliability|availability|growth|impact)\b/i.test(line)
  ));
  return sentence ? trimContextSentence(sentence) : undefined;
}

function trimContextSentence(value: string) {
  return value.replace(/\s+/g, " ").trim().replace(/[.;]\s*$/, "").slice(0, 220);
}

function resumeBulletFromSentence(sentence: string) {
  const cleaned = cleanBulletText(sentence);
  if (/^(built|led|owned|managed|created|designed|developed|implemented|delivered|improved|partnered|collaborated|supported|architected|maintained)\b/i.test(cleaned)) {
    return cleaned;
  }
  if (/experience (with|in)|responsible for|work(ed)? (with|on)/i.test(cleaned)) {
    return `Applied ${lowercaseFirst(cleaned)}`;
  }
  return `Supported ${lowercaseFirst(cleaned)}`;
}

function cleanBulletText(value: string) {
  return value
    .replace(/^[-•*\s]+/, "")
    .replace(/\s+/g, " ")
    .replace(/[.;]\s*$/, "")
    .trim();
}

function sentenceScore(sentence: string, focusTerms: string[]) {
  const normalized = sentence.toLowerCase();
  let score = 0;
  if (/\b(build|built|lead|led|own|owned|design|designed|develop|developed|implement|implemented|deliver|delivered|improve|improved|architect|architected)\b/.test(normalized)) score += 8;
  if (/\b(react|typescript|javascript|node|next|api|design system|frontend|fullstack|security|identity|ai|agent|rag|mcp|postgres|prisma)\b/.test(normalized)) score += 5;
  if (hasMetric(sentence)) score += 4;
  for (const term of focusTerms) {
    if (term.length > 1 && normalized.includes(term.toLowerCase())) score += 3;
  }
  return score;
}

function extractKeywords(text: string) {
  const known = [
    "React",
    "TypeScript",
    "JavaScript",
    "Node.js",
    "Next.js",
    "API",
    "GraphQL",
    "Postgres",
    "Prisma",
    "MCP",
    "RAG",
    "AI",
    "LangGraph",
    "Design Systems",
    "Frontend",
    "Full Stack",
    "Security",
    "Identity",
    "Testing",
    "Playwright",
  ];
  const matches = known.filter((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text));
  return uniqueStrings([...matches, ...splitTerms(text).filter((term) => term.length > 2 && /^[A-Za-z][A-Za-z0-9+#.-]*$/.test(term)).slice(0, 8)]).slice(0, 12);
}

function splitTerms(value: string) {
  return value.split(/[,;\n]/).map((term) => term.trim()).filter(Boolean);
}

function hasMetric(value: string) {
  return /\b\d+(?:[.,]\d+)?\s*(?:%|x|k|m|users?|teams?|engineers?|hours?|days?|weeks?|months?|years?|ms|seconds?|requests?|tickets?|projects?)\b/i.test(value);
}

function isSupportedExcerpt(excerpt: string, normalizedSource: string) {
  const normalizedExcerpt = normalizeForSupport(excerpt);
  if (normalizedSource.includes(normalizedExcerpt)) return true;
  const excerptTokens = new Set(normalizedExcerpt.split(" ").filter((token) => token.length > 3));
  if (!excerptTokens.size) return false;
  const sourceTokens = new Set(normalizedSource.split(" ").filter((token) => token.length > 3));
  const overlap = Array.from(excerptTokens).filter((token) => sourceTokens.has(token)).length;
  return overlap / excerptTokens.size >= 0.75;
}

function normalizeForSupport(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueByText<T extends { text: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeForSupport(item.text);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function lowercaseFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
