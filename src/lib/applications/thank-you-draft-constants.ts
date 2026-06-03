export const thankYouStages = [
  "recruiter_screen",
  "hiring_manager",
  "technical",
  "panel_onsite",
  "final",
  "informational",
  "custom",
] as const;

export type ThankYouStage = typeof thankYouStages[number];

export function thankYouStageLabel(stage: string) {
  const labels: Record<string, string> = {
    recruiter_screen: "recruiter screen",
    hiring_manager: "hiring manager interview",
    technical: "technical interview",
    panel_onsite: "panel/onsite interview",
    final: "final interview",
    informational: "informational conversation",
    custom: "interview",
  };
  return labels[stage] ?? "interview";
}
