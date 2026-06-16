import { Prisma } from "@prisma/client";

export type ResumeVersionSuggestionStatus = "NEEDS_REVIEW" | "APPROVED" | "REJECTED";

export type ResumeTechItem = {
  name: string;
  version?: string;
  source?: "user_confirmed" | "source_evidence" | "approved_suggestion";
};

export type ResumeVersionSuggestion = {
  id: string;
  name: string;
  suggestedVersion: string;
  confidence: number;
  rationale: string;
  status: ResumeVersionSuggestionStatus;
  source: "source_evidence" | "date_window";
  evidence: string[];
};

export type ResumeExperienceContext = {
  applicationTitle?: string;
  applicationSummary?: string;
  users?: string;
  scaleImpact?: string;
  confirmedTech: ResumeTechItem[];
  versionSuggestions: ResumeVersionSuggestion[];
  updatedAt?: string;
};

export function emptyResumeExperienceContext(): ResumeExperienceContext {
  return {
    confirmedTech: [],
    versionSuggestions: [],
  };
}

export function parseResumeExperienceContext(value: unknown): ResumeExperienceContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyResumeExperienceContext();
  const record = value as Record<string, unknown>;
  return {
    applicationTitle: stringValue(record.applicationTitle),
    applicationSummary: stringValue(record.applicationSummary),
    users: stringValue(record.users),
    scaleImpact: stringValue(record.scaleImpact),
    confirmedTech: objectArray(record.confirmedTech)
      .map((item) => ({
        name: stringValue(item.name) ?? "",
        version: stringValue(item.version),
        source: techSourceValue(item.source),
      }))
      .filter((item) => item.name),
    versionSuggestions: objectArray(record.versionSuggestions)
      .map((item) => ({
        id: stringValue(item.id) ?? suggestionId(stringValue(item.name) ?? "", stringValue(item.suggestedVersion) ?? ""),
        name: stringValue(item.name) ?? "",
        suggestedVersion: stringValue(item.suggestedVersion) ?? "",
        confidence: numberValue(item.confidence) ?? 0.5,
        rationale: stringValue(item.rationale) ?? "",
        status: statusValue(item.status),
        source: item.source === "source_evidence" ? "source_evidence" as const : "date_window" as const,
        evidence: stringArray(item.evidence),
      }))
      .filter((item) => item.name && item.suggestedVersion),
    updatedAt: stringValue(record.updatedAt),
  };
}

export function mergeResumeExperienceContext(
  existingValue: unknown,
  patch: Partial<ResumeExperienceContext>,
): ResumeExperienceContext {
  const existing = parseResumeExperienceContext(existingValue);
  return {
    ...existing,
    ...definedStringFields(patch),
    confirmedTech: patch.confirmedTech ? dedupeTechItems(patch.confirmedTech) : existing.confirmedTech,
    versionSuggestions: patch.versionSuggestions ? dedupeVersionSuggestions(patch.versionSuggestions) : existing.versionSuggestions,
    updatedAt: new Date().toISOString(),
  };
}

export function appendVersionSuggestions(
  existingValue: unknown,
  suggestions: ResumeVersionSuggestion[],
): ResumeExperienceContext {
  const existing = parseResumeExperienceContext(existingValue);
  return {
    ...existing,
    versionSuggestions: dedupeVersionSuggestions([...existing.versionSuggestions, ...suggestions]),
    updatedAt: new Date().toISOString(),
  };
}

export function approvedTechFromContext(contextValue: unknown): ResumeTechItem[] {
  const context = parseResumeExperienceContext(contextValue);
  const approvedSuggestions = context.versionSuggestions
    .filter((suggestion) => suggestion.status === "APPROVED")
    .map((suggestion): ResumeTechItem => ({
      name: suggestion.name,
      version: suggestion.suggestedVersion,
      source: "approved_suggestion",
    }));
  return dedupeTechItems([...context.confirmedTech, ...approvedSuggestions]);
}

export function techUsedLine(contextValue: unknown): string | null {
  const tech = approvedTechFromContext(contextValue);
  if (!tech.length) return null;
  return `Tech Used: ${tech.map((item) => [item.name, item.version].filter(Boolean).join(" ")).join(", ")}`;
}

export function pendingVersionSuggestionsFromContexts(contexts: unknown[]) {
  return contexts.flatMap((value) => parseResumeExperienceContext(value).versionSuggestions)
    .filter((suggestion) => suggestion.status === "NEEDS_REVIEW");
}

export function resumeContextJson(context: ResumeExperienceContext): Prisma.InputJsonValue {
  return context as unknown as Prisma.InputJsonValue;
}

export function suggestionId(name: string, version: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}:${version.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function dedupeTechItems(items: ResumeTechItem[]) {
  const seen = new Set<string>();
  return items
    .map((item) => ({
      name: item.name.trim(),
      version: item.version?.trim() || undefined,
      source: item.source,
    }))
    .filter((item) => item.name)
    .filter((item) => {
      const key = `${item.name.toLowerCase()}|${item.version?.toLowerCase() ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function dedupeVersionSuggestions(items: ResumeVersionSuggestion[]) {
  const seen = new Set<string>();
  return items
    .map((item) => ({
      ...item,
      name: item.name.trim(),
      suggestedVersion: item.suggestedVersion.trim(),
      evidence: Array.from(new Set(item.evidence.map((evidence) => evidence.trim()).filter(Boolean))).slice(0, 5),
      status: statusValue(item.status),
      confidence: Math.max(0, Math.min(1, item.confidence)),
    }))
    .filter((item) => item.name && item.suggestedVersion)
    .filter((item) => {
      const key = `${item.name.toLowerCase()}|${item.suggestedVersion.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function definedStringFields(patch: Partial<ResumeExperienceContext>) {
  return {
    ...(typeof patch.applicationTitle === "string" ? { applicationTitle: patch.applicationTitle.trim() || undefined } : {}),
    ...(typeof patch.applicationSummary === "string" ? { applicationSummary: patch.applicationSummary.trim() || undefined } : {}),
    ...(typeof patch.users === "string" ? { users: patch.users.trim() || undefined } : {}),
    ...(typeof patch.scaleImpact === "string" ? { scaleImpact: patch.scaleImpact.trim() || undefined } : {}),
  };
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function statusValue(value: unknown): ResumeVersionSuggestionStatus {
  return value === "APPROVED" || value === "REJECTED" || value === "NEEDS_REVIEW" ? value : "NEEDS_REVIEW";
}

function techSourceValue(value: unknown): ResumeTechItem["source"] | undefined {
  return value === "user_confirmed" || value === "source_evidence" || value === "approved_suggestion" ? value : undefined;
}
