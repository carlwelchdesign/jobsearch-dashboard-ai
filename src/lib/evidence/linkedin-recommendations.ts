import { createHash } from "crypto";
import type { ExperienceCategory, Prisma } from "@prisma/client";
import { inferEvidenceTags, normalizeTags } from "@/lib/evidence/tags";
import type { EvidenceDraft } from "@/lib/evidence/ingest";
import { toExperienceCategory } from "@/lib/resumes/db";

export type LinkedInRecommendationEntry = {
  recommenderName: string;
  recommenderHeadline: string;
  date: string;
  relationship: string;
  body: string;
  sourceRef: string;
  themes: string[];
};

export type LinkedInRecommendationBulletDraft = {
  company: string;
  role: string;
  category: ExperienceCategory;
  text: string;
  keywords: string[];
  sourceText: string;
  metrics: Prisma.InputJsonValue;
  truthLevel: "needs_review";
};

const dateLinePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4},\s+(.+)$/;

const themeRules: Array<{ theme: string; category: string; keywords: string[]; patterns: RegExp[]; bullet: string }> = [
  {
    theme: "frontend-visualization-performance",
    category: "visualization",
    keywords: ["frontend", "visualization", "performance", "user experience"],
    patterns: [/\bfrontend engineer\b/i, /\bvisualization\b/i, /\bhigh-performance user experience\b/i],
    bullet: "Created frontend user experiences with strong visualization craft and a performance-minded implementation approach.",
  },
  {
    theme: "design-system-storybook",
    category: "design_systems",
    keywords: ["Storybook", "design systems", "UI components", "modular frontend"],
    patterns: [/\bstorybook\b/i, /\bmodular\b/i, /\bdesign system\b/i, /\bui components?\b/i],
    bullet: "Built modular UI components and Storybook workflows that improved design-system consistency and development speed.",
  },
  {
    theme: "feature-leadership",
    category: "leadership",
    keywords: ["frontend leadership", "critical features", "customer experience"],
    patterns: [/\bled several critical frontend features\b/i, /\bdirectly improved the experience\b/i],
    bullet: "Led critical frontend feature work that improved customer-facing product experience.",
  },
  {
    theme: "mentorship",
    category: "leadership",
    keywords: ["mentorship", "technical leadership", "team growth"],
    patterns: [/\bnatural mentor\b/i, /\btrue mentor\b/i, /\bhelping others grow\b/i, /\btaught us\b/i, /\bmanages people\b/i],
    bullet: "Mentored engineers through modern frontend practices and helped teammates grow technically.",
  },
  {
    theme: "calm-delivery",
    category: "leadership",
    keywords: ["calm delivery", "problem solving", "under pressure"],
    patterns: [/\bcalm\b/i, /\blife-saver\b/i, /\brescued\b/i, /\balways had a solution\b/i, /\bpersistence\b/i],
    bullet: "Brought calm, persistent problem-solving to complex frontend and JavaScript delivery under pressure.",
  },
  {
    theme: "creative-engineering",
    category: "frontend",
    keywords: ["creative engineering", "web design", "animation", "multimedia", "product UI"],
    patterns: [/\banimation artistry\b/i, /\bweb design\b/i, /\bmultimedia\b/i, /\bflash\b/i, /\bleft and right brain\b/i, /\bcreative\b/i, /\bdigital presence\b/i, /\bbrand stand out\b/i],
    bullet: "Combined creative design instincts with hands-on engineering across web, animation, multimedia, and product UI work.",
  },
  {
    theme: "emerging-technology",
    category: "frontend",
    keywords: ["emerging technology", "React", "ES6", "VR", "AR"],
    patterns: [/\bcutting edge\b/i, /\blearning new technologies\b/i, /\breact\b/i, /\bes6\b/i, /\bvr\b/i, /\bar\b/i],
    bullet: "Adopted emerging frontend and interactive technologies early, including modern JavaScript practices and immersive UI work.",
  },
];

export function parseLinkedInRecommendations(rawText: string): LinkedInRecommendationEntry[] {
  const lines = rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  const headers = findRecommendationHeaders(lines);

  return headers
    .map((header, index): LinkedInRecommendationEntry | null => {
      const nextHeader = headers[index + 1];
      const bodyEnd = nextHeader ? nextHeader.nameLineIndex : lines.length;
      const body = cleanRecommendationBody(lines.slice(header.dateLineIndex + 1, bodyEnd).join("\n"));
      if (!body) return null;

      return {
        recommenderName: lines[header.nameLineIndex],
        recommenderHeadline: header.recommenderHeadline,
        date: header.date,
        relationship: header.relationship,
        body,
        sourceRef: recommendationSourceRef({
          recommenderName: lines[header.nameLineIndex],
          date: header.date,
          relationship: header.relationship,
          body,
        }),
        themes: extractRecommendationThemes(body),
      };
    })
    .filter((entry): entry is LinkedInRecommendationEntry => Boolean(entry));
}

export function buildRecommendationEvidenceDraft(candidateProfileId: string, entry: LinkedInRecommendationEntry): EvidenceDraft {
  const tags = normalizeTags([
    "linkedin-recommendation",
    "third-party-signal",
    ...entry.themes,
    ...inferEvidenceTags(entry.recommenderHeadline, entry.relationship, entry.body),
  ]);

  return {
    candidateProfileId,
    type: entry.themes.some((theme) => theme.includes("storybook") || theme.includes("technology")) ? "SKILL" : "ACHIEVEMENT",
    title: `LinkedIn recommendation from ${entry.recommenderName}`,
    content: entry.body,
    sourceType: "LINKEDIN",
    sourceRef: entry.sourceRef,
    confidence: "NEEDS_REVIEW",
    usableInResume: false,
    usableInCoverLetter: false,
    usableInRecruiterMessage: false,
    tags,
    metadata: {
      importedFrom: "linkedin_recommendations_import",
      recommenderName: entry.recommenderName,
      recommenderHeadline: entry.recommenderHeadline,
      recommendationDate: entry.date,
      relationship: entry.relationship,
      themes: entry.themes,
      generationGuidance:
        "Use as a third-party reputation signal after approval. Prefer paraphrased themes over direct quotation unless the user explicitly chooses quoted testimonial language.",
    } as Prisma.InputJsonValue,
  };
}

export function buildRecommendationBulletDrafts(entry: LinkedInRecommendationEntry): LinkedInRecommendationBulletDraft[] {
  const company = inferRecommendationCompany(entry);
  if (!company) return [];
  const role = inferRecommendationRole(entry);
  const sourceText = [
    `${entry.recommenderName}, ${entry.recommenderHeadline}`,
    `${entry.date}, ${entry.relationship}`,
    entry.body,
  ].join("\n\n");

  return themeRules
    .filter((rule) => entry.themes.includes(rule.theme))
    .map((rule) => ({
      company,
      role,
      category: toExperienceCategory(rule.category),
      text: rule.bullet,
      keywords: rule.keywords,
      sourceText,
      metrics: {
        source: "linkedin_recommendation",
        recommendationSourceRef: entry.sourceRef,
        recommenderName: entry.recommenderName,
        relationship: entry.relationship,
        themes: [rule.theme],
      } as Prisma.InputJsonValue,
      truthLevel: "needs_review" as const,
    }));
}

function findRecommendationHeaders(lines: string[]) {
  const headers: Array<{
    nameLineIndex: number;
    recommenderHeadline: string;
    dateLineIndex: number;
    date: string;
    relationship: string;
  }> = [];

  for (let dateLineIndex = 0; dateLineIndex < lines.length; dateLineIndex += 1) {
    const match = lines[dateLineIndex].match(dateLinePattern);
    if (!match) continue;
    const headlineLineIndex = previousNonEmptyLineIndex(lines, dateLineIndex - 1);
    if (headlineLineIndex === null) continue;
    let nameLineIndex = previousNonEmptyLineIndex(lines, headlineLineIndex - 1);
    let recommenderHeadline = lines[headlineLineIndex];
    if (looksLikePersonName(lines[headlineLineIndex])) {
      nameLineIndex = headlineLineIndex;
      recommenderHeadline = "";
    }
    if (nameLineIndex === null) continue;
    headers.push({
      nameLineIndex,
      recommenderHeadline,
      dateLineIndex,
      date: lines[dateLineIndex].slice(0, lines[dateLineIndex].indexOf(`, ${match[2]}`)).trim(),
      relationship: match[2].trim(),
    });
  }

  return headers;
}

function previousNonEmptyLineIndex(lines: string[], start: number) {
  for (let index = start; index >= 0; index -= 1) {
    if (lines[index]) return index;
  }
  return null;
}

function looksLikePersonName(value: string) {
  const words = value.trim().split(/\s+/);
  return words.length >= 2
    && words.length <= 4
    && !/[|/@•>]/.test(value)
    && words.every((word) => /^[A-Z][A-Za-z'.-]*$/.test(word));
}

function cleanRecommendationBody(body: string) {
  return body
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[.…]\s*more\s*$/i, "")
    .trim();
}

function extractRecommendationThemes(body: string) {
  return themeRules
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(body)))
    .map((rule) => rule.theme);
}

function recommendationSourceRef(input: { recommenderName: string; date: string; relationship: string; body: string }) {
  const identity = [
    input.recommenderName,
    input.date,
    input.relationship,
    input.body.toLowerCase().replace(/\s+/g, " ").trim(),
  ].join("|");
  return `linkedin-recommendation:${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

function inferRecommendationCompany(entry: LinkedInRecommendationEntry) {
  const text = `${entry.relationship} ${entry.body}`;
  if (/\bgrindr\b/i.test(text)) return "Grindr";
  if (/\bgeneral dynamics\b/i.test(text)) return "General Dynamics";
  if (/\bdavid allen\b/i.test(text)) return "David Allen Company";
  return null;
}

function inferRecommendationRole(entry: LinkedInRecommendationEntry) {
  const text = `${entry.relationship} ${entry.body}`;
  if (/\bmanager\b|\bmanaged\b|\breported to\b|\bteam manager\b/i.test(text)) return "Frontend Engineering Lead";
  if (/\bdesigner\b|\bdesign\b|\bflash\b|\banimation\b|\bmultimedia\b/i.test(text)) return "Interactive Developer";
  return "Frontend Engineer";
}
