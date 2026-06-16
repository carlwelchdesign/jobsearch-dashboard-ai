import type { ResumeVersionSuggestion } from "@/lib/resumes/resume-context";
import { suggestionId } from "@/lib/resumes/resume-context";

type VersionWindow = {
  label: string;
  start: string;
  end?: string;
};

type VersionInferenceInput = {
  technologies: string[];
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  sourceText?: string | null;
};

const VERSION_WINDOWS: Record<string, VersionWindow[]> = {
  react: [
    { label: "15", start: "2016-04", end: "2017-09" },
    { label: "16", start: "2017-09", end: "2020-10" },
    { label: "17", start: "2020-10", end: "2022-03" },
    { label: "18", start: "2022-03", end: "2024-12" },
    { label: "19", start: "2024-12" },
  ],
  "node.js": [
    { label: "8", start: "2017-05", end: "2018-04" },
    { label: "10", start: "2018-04", end: "2019-04" },
    { label: "12", start: "2019-04", end: "2020-04" },
    { label: "14", start: "2020-04", end: "2021-04" },
    { label: "16", start: "2021-04", end: "2022-04" },
    { label: "18", start: "2022-04", end: "2023-04" },
    { label: "20", start: "2023-04", end: "2024-04" },
    { label: "22", start: "2024-04", end: "2025-05" },
    { label: "24", start: "2025-05" },
  ],
  typescript: [
    { label: "2.x", start: "2016-09", end: "2018-07" },
    { label: "3.x", start: "2018-07", end: "2020-08" },
    { label: "4.x", start: "2020-08", end: "2023-03" },
    { label: "5.x", start: "2023-03" },
  ],
  "next.js": [
    { label: "9", start: "2019-07", end: "2020-06" },
    { label: "10", start: "2020-06", end: "2021-06" },
    { label: "11", start: "2021-06", end: "2021-10" },
    { label: "12", start: "2021-10", end: "2022-10" },
    { label: "13", start: "2022-10", end: "2023-10" },
    { label: "14", start: "2023-10", end: "2024-10" },
    { label: "15", start: "2024-10" },
  ],
};

const TECH_ALIASES: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: "React", patterns: [/\breact(?:\.js)?\b/i] },
  { canonical: "Node.js", patterns: [/\bnode(?:\.js)?\b/i] },
  { canonical: "TypeScript", patterns: [/\btypescript\b|\bts\b/i] },
  { canonical: "Next.js", patterns: [/\bnext(?:\.js)?\b/i] },
];

const UNVERSIONED_SERVICES = /\b(aws|s3|lambda|ec2|cloudfront|cloudwatch|iam|dynamodb|postgres|postgresql|mysql|sql|rest api|graphql)\b/i;

export function inferVersionSuggestions(input: VersionInferenceInput): ResumeVersionSuggestion[] {
  const sourceText = input.sourceText ?? "";
  const technologies = normalizeTechnologies(input.technologies, sourceText);
  const roleStart = parseRoleDate(input.startDate, false);
  const roleEnd = parseRoleDate(input.endDate, Boolean(input.isCurrent));

  return technologies.flatMap((name) => {
    if (UNVERSIONED_SERVICES.test(name)) return [];
    const explicit = explicitVersionSuggestion(name, sourceText);
    if (explicit) return [explicit];

    const key = canonicalKey(name);
    const windows = VERSION_WINDOWS[key];
    if (!windows || !roleStart || !roleEnd) return [];
    const overlaps = windows.filter((window) => overlapsWindow(roleStart, roleEnd, parseWindowDate(window.start), window.end ? parseWindowDate(window.end) : 999999));
    if (!overlaps.length) return [];
    const version = collapseVersions(overlaps.map((window) => window.label));
    return [{
      id: suggestionId(name, version),
      name,
      suggestedVersion: version,
      confidence: overlaps.length === 1 ? 0.68 : 0.56,
      rationale: `Estimated from ${[input.startDate, input.endDate || (input.isCurrent ? "Present" : undefined)].filter(Boolean).join(" - ")} role dates after ${name} appeared in role evidence.`,
      status: "NEEDS_REVIEW" as const,
      source: "date_window" as const,
      evidence: [name, input.startDate, input.endDate || (input.isCurrent ? "Present" : "")].filter((value): value is string => Boolean(value)),
    }];
  });
}

function normalizeTechnologies(values: string[], sourceText: string) {
  const seeded = values.flatMap((value) => splitTech(value));
  const aliases = TECH_ALIASES
    .filter((alias) => seeded.some((tech) => alias.patterns.some((pattern) => pattern.test(tech))) || alias.patterns.some((pattern) => pattern.test(sourceText)))
    .map((alias) => alias.canonical);
  const all = [...seeded, ...aliases].map((value) => canonicalDisplayName(value)).filter(Boolean);
  return Array.from(new Set(all.map((value) => value.trim()).filter(Boolean)));
}

function splitTech(value: string) {
  return value.split(/[,;/|]+/).map((part) => part.trim()).filter(Boolean);
}

function canonicalDisplayName(value: string) {
  const alias = TECH_ALIASES.find((item) => item.patterns.some((pattern) => pattern.test(value)));
  return alias?.canonical ?? value.trim();
}

function explicitVersionSuggestion(name: string, sourceText: string): ResumeVersionSuggestion | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\.js/i, "(?:\\.js)?");
  const pattern = new RegExp(`\\b${escapedName}\\s*(?:v|version)?\\s*(\\d+(?:\\.\\d+)?(?:\\.\\d+)?)\\b`, "i");
  const match = sourceText.match(pattern);
  if (!match?.[1]) return null;
  return {
    id: suggestionId(name, match[1]),
    name,
    suggestedVersion: match[1],
    confidence: 0.86,
    rationale: `Found an explicit ${name} version in the supplied role evidence.`,
    status: "NEEDS_REVIEW",
    source: "source_evidence",
    evidence: [match[0]],
  };
}

function canonicalKey(name: string) {
  const normalized = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (/^node(?:\.js)?$/.test(normalized)) return "node.js";
  if (/^next(?:\.js)?$/.test(normalized)) return "next.js";
  if (/^react(?:\.js)?$/.test(normalized)) return "react";
  return normalized;
}

function collapseVersions(labels: string[]) {
  const unique = Array.from(new Set(labels));
  if (unique.length <= 1) return unique[0] ?? "";
  const numeric = unique.every((label) => /^\d+$/.test(label));
  if (numeric) return `${unique[0]}-${unique[unique.length - 1]}`;
  return unique.join("-");
}

function overlapsWindow(roleStart: number, roleEnd: number, windowStart: number, windowEnd: number) {
  return roleStart <= windowEnd && roleEnd >= windowStart;
}

function parseWindowDate(value: string) {
  const [year, month] = value.split("-").map(Number);
  return year * 100 + (month || 1);
}

function parseRoleDate(value: string | null | undefined, isCurrent: boolean) {
  if (isCurrent || /present|current|now/i.test(value ?? "")) return 999999;
  if (!value) return 0;
  const match = value.match(/(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(\d{4})/i);
  if (!match) return 0;
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const month = match[1] ? months[match[1].toLowerCase()] ?? 12 : 12;
  return Number(match[2]) * 100 + month;
}
