export const RESUME_FORMATS = ["modern_two_column", "atelier", "tschichold", "swiss"] as const;

export type ResumeFormat = typeof RESUME_FORMATS[number];
export type LegacyResumeFormat = Exclude<ResumeFormat, "modern_two_column">;

export const DEFAULT_RESUME_FORMAT: ResumeFormat = "modern_two_column";

export function normalizeResumeFormat(value: unknown): ResumeFormat {
  return typeof value === "string" && RESUME_FORMATS.includes(value as ResumeFormat)
    ? value as ResumeFormat
    : DEFAULT_RESUME_FORMAT;
}

export function isLegacyResumeFormat(value: ResumeFormat): value is LegacyResumeFormat {
  return value !== "modern_two_column";
}

export function resumeFormatLabel(value: ResumeFormat) {
  switch (value) {
    case "atelier":
      return "Atelier";
    case "tschichold":
      return "Tschichold";
    case "swiss":
      return "Swiss";
    default:
      return "Modern two-column";
  }
}
