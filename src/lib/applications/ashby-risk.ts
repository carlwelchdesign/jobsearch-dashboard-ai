export type AshbyRiskCategory =
  | "work_authorization"
  | "sponsorship"
  | "location"
  | "relocation"
  | "salary"
  | "required_experience"
  | "must_have_skill"
  | "onsite_hybrid"
  | "custom";

export type AshbyRiskLevel = "ready" | "needs_review" | "high_risk";

export type AshbyRiskChecklistItem = {
  category: AshbyRiskCategory;
  label: string;
  status: AshbyRiskLevel;
  detail: string;
  suggestedAnswer?: string;
  autoFillSafe: boolean;
};

export type AshbyDetectedField = {
  label: string;
  category: AshbyRiskCategory;
  riskLevel: AshbyRiskLevel;
  suggestedAnswer?: string;
  autoFillSafe: boolean;
};

export type AshbyRiskAssessment = {
  enabled: boolean;
  atsProvider: "ashby";
  riskLevel: AshbyRiskLevel;
  checklist: AshbyRiskChecklistItem[];
  detectedFields: AshbyDetectedField[];
  criteriaVisibility?: AshbyCriteriaVisibility;
  recommendedActions: string[];
};

export type AshbyCriteriaVisibility = {
  status: AshbyRiskLevel;
  presentCriteria: string[];
  missingCriteria: string[];
  warnings: string[];
  suggestedEdits: string[];
};

type AshbyRiskInput = {
  atsProvider?: string | null;
  applicationUrl?: string | null;
  job: {
    title?: string | null;
    company?: string | null;
    description?: string | null;
    location?: string | null;
    country?: string | null;
    remoteType?: string | null;
  };
  candidate?: {
    location?: string | null;
    yearsExperience?: number | null;
  } | null;
  resumeText?: string | null;
  selectedAnswers?: Array<{ question?: string | null; answer?: string | null }> | null;
  detectedFieldLabels?: string[];
};

const CATEGORY_LABELS: Record<AshbyRiskCategory, string> = {
  work_authorization: "Work authorization",
  sponsorship: "Sponsorship",
  location: "Location eligibility",
  relocation: "Relocation",
  salary: "Salary expectations",
  required_experience: "Required experience",
  must_have_skill: "Must-have skills",
  onsite_hybrid: "Onsite or hybrid availability",
  custom: "Custom knockout question",
};

const HIGH_VALUE_CRITERIA = [
  "React",
  "TypeScript",
  "JavaScript",
  "Next.js",
  "GraphQL",
  "Node.js",
  "frontend",
  "full-stack",
  "design systems",
  "accessibility",
  "dashboards",
  "SaaS",
  "security",
  "authentication",
  "AI",
  "LLM",
  "AWS",
  "PostgreSQL",
  "API",
  "testing",
];

export function isAshbyApplication(input: Pick<AshbyRiskInput, "atsProvider" | "applicationUrl">) {
  return input.atsProvider === "ashby" || /(^|\.)ashbyhq\.com$/i.test(hostFromUrl(input.applicationUrl));
}

export function classifyAshbyField(label: string): AshbyDetectedField | null {
  const normalized = normalize(label);
  const category = ashbyCategoryForText(normalized);
  if (!category) return null;
  const safe = category === "work_authorization" || category === "sponsorship";
  const suggestedAnswer = category === "work_authorization" ? "Yes" : category === "sponsorship" ? "No" : undefined;
  return {
    label: label.trim(),
    category,
    riskLevel: safe ? "ready" : category === "salary" || category === "relocation" || category === "custom" ? "high_risk" : "needs_review",
    suggestedAnswer,
    autoFillSafe: safe,
  };
}

export function buildAshbyRiskAssessment(input: AshbyRiskInput): AshbyRiskAssessment | null {
  if (!isAshbyApplication(input)) return null;

  const selectedAnswerText = (input.selectedAnswers ?? [])
    .map((answer) => `${answer.question ?? ""} ${answer.answer ?? ""}`)
    .join("\n");
  const checklist = defaultChecklist(input, selectedAnswerText);
  const detectedFields = Array.from(new Map((input.detectedFieldLabels ?? [])
    .map(classifyAshbyField)
    .filter((item): item is AshbyDetectedField => Boolean(item))
    .map((item) => [normalize(`${item.category}:${item.label}`), item])).values());
  const criteriaVisibility = input.resumeText
    ? evaluateAshbyCriteriaVisibility({
        jobTitle: input.job.title,
        jobDescription: input.job.description,
        resumeText: input.resumeText,
      })
    : undefined;
  const allStatuses = [
    ...checklist.map((item) => item.status),
    ...detectedFields.map((item) => item.riskLevel),
    ...(criteriaVisibility ? [criteriaVisibility.status] : []),
  ];
  const riskLevel: AshbyRiskLevel = allStatuses.includes("high_risk")
    ? "high_risk"
    : allStatuses.includes("needs_review")
      ? "needs_review"
      : "ready";

  return {
    enabled: true,
    atsProvider: "ashby",
    riskLevel,
    checklist,
    detectedFields,
    criteriaVisibility,
    recommendedActions: recommendedActions({ riskLevel, checklist, detectedFields, criteriaVisibility }),
  };
}

export function evaluateAshbyCriteriaVisibility({
  jobTitle,
  jobDescription,
  resumeText,
}: {
  jobTitle?: string | null;
  jobDescription?: string | null;
  resumeText: string;
}): AshbyCriteriaVisibility {
  const criteria = extractAshbyCriteria(`${jobTitle ?? ""}\n${jobDescription ?? ""}`);
  const topThird = resumeText.slice(0, Math.max(1200, Math.ceil(resumeText.length / 3)));
  const presentCriteria = criteria.filter((criterion) => includesTerm(topThird, criterion));
  const missingCriteria = criteria.filter((criterion) => !includesTerm(topThird, criterion));
  const warnings = missingCriteria.length
    ? [`Top-third resume visibility is missing ${missingCriteria.slice(0, 6).join(", ")}.`]
    : [];
  const suggestedEdits = missingCriteria.length
    ? ["Make supported must-have criteria explicit in the summary, skills, or first two experience bullets before applying through Ashby."]
    : [];
  return {
    status: missingCriteria.length >= 4 ? "high_risk" : missingCriteria.length ? "needs_review" : "ready",
    presentCriteria,
    missingCriteria,
    warnings,
    suggestedEdits,
  };
}

export function extractAshbyCriteria(text: string) {
  const normalized = normalize(text);
  const criteria = HIGH_VALUE_CRITERIA.filter((term) => includesTerm(normalized, term));
  const years = normalized.match(/\b([3-9]|1\d|2\d)\+?\s*(?:years|yrs)\b/);
  if (years) criteria.push(`${years[1]}+ years`);
  return Array.from(new Set(criteria)).slice(0, 12);
}

function defaultChecklist(input: AshbyRiskInput, selectedAnswerText: string): AshbyRiskChecklistItem[] {
  const jobText = normalize(`${input.job.title ?? ""} ${input.job.description ?? ""} ${input.job.location ?? ""} ${input.job.remoteType ?? ""}`);
  const candidateLocation = normalize(input.candidate?.location ?? "");
  const hasSelected = (category: AshbyRiskCategory) => ashbyCategoryForText(normalize(selectedAnswerText)) === category || categoryPattern(category).test(selectedAnswerText);
  const items: AshbyRiskChecklistItem[] = [
    {
      category: "work_authorization",
      label: CATEGORY_LABELS.work_authorization,
      status: isLikelyUsJob(input.job) && isLikelyUsCandidate(candidateLocation) ? "ready" : "needs_review",
      detail: isLikelyUsJob(input.job) && isLikelyUsCandidate(candidateLocation)
        ? "US role and candidate location support a favorable work-authorization answer."
        : "Confirm the role country and work authorization before submit.",
      suggestedAnswer: "Yes",
      autoFillSafe: isLikelyUsJob(input.job) && isLikelyUsCandidate(candidateLocation),
    },
    {
      category: "sponsorship",
      label: CATEGORY_LABELS.sponsorship,
      status: "ready",
      detail: "Existing assistant rules answer sponsorship questions with the favorable no-sponsorship response.",
      suggestedAnswer: "No",
      autoFillSafe: true,
    },
  ];

  if (/(hybrid|onsite|on-site|office|in person|in-person)/.test(jobText)) {
    items.push({
      category: "onsite_hybrid",
      label: CATEGORY_LABELS.onsite_hybrid,
      status: hasSelected("onsite_hybrid") ? "ready" : "needs_review",
      detail: "Role mentions onsite or hybrid requirements. Confirm availability before submitting.",
      autoFillSafe: false,
    });
  }
  if (/(relocat|move to|based in)/.test(jobText)) {
    items.push({
      category: "relocation",
      label: CATEGORY_LABELS.relocation,
      status: hasSelected("relocation") ? "ready" : "high_risk",
      detail: "Relocation answers can be knockout fields and should be explicitly reviewed.",
      autoFillSafe: false,
    });
  }
  if (/(salary|compensation|pay range|expected pay|expected comp)/.test(jobText)) {
    items.push({
      category: "salary",
      label: CATEGORY_LABELS.salary,
      status: hasSelected("salary") ? "ready" : "high_risk",
      detail: "Salary expectations can trigger filters. Use a deliberate answer, not an accidental blank or low anchor.",
      autoFillSafe: false,
    });
  }
  if (/\b([3-9]|1\d|2\d)\+?\s*(?:years|yrs)\b/.test(jobText)) {
    items.push({
      category: "required_experience",
      label: CATEGORY_LABELS.required_experience,
      status: input.candidate?.yearsExperience ? "ready" : "needs_review",
      detail: input.candidate?.yearsExperience
        ? `Candidate profile lists ${input.candidate.yearsExperience}+ years of experience.`
        : "Confirm years-of-experience answers against the profile before submit.",
      suggestedAnswer: input.candidate?.yearsExperience ? String(input.candidate.yearsExperience) : undefined,
      autoFillSafe: Boolean(input.candidate?.yearsExperience),
    });
  }
  return items;
}

function recommendedActions({
  riskLevel,
  checklist,
  detectedFields,
  criteriaVisibility,
}: {
  riskLevel: AshbyRiskLevel;
  checklist: AshbyRiskChecklistItem[];
  detectedFields: AshbyDetectedField[];
  criteriaVisibility?: AshbyCriteriaVisibility;
}) {
  const actions = [
    "Review Ashby applications manually before final submit; auto-submit remains disabled.",
    "Confirm work authorization, sponsorship, location, salary, and required-experience answers before clicking submit.",
  ];
  if (riskLevel !== "ready") actions.push("Resolve high-risk or needs-review checklist items before submitting.");
  if (detectedFields.some((field) => field.category === "custom")) actions.push("Generate and select a saved answer for custom knockout-style questions.");
  if (criteriaVisibility?.missingCriteria.length) actions.push("Move supported must-have criteria into the resume summary, skills, or first two bullets.");
  if (checklist.some((item) => item.category === "salary" && item.status !== "ready")) actions.push("Use a deliberate compensation answer that matches your target range and flexibility.");
  return Array.from(new Set(actions));
}

function ashbyCategoryForText(normalized: string): AshbyRiskCategory | null {
  if (categoryPattern("work_authorization").test(normalized)) return "work_authorization";
  if (categoryPattern("sponsorship").test(normalized)) return "sponsorship";
  if (categoryPattern("salary").test(normalized)) return "salary";
  if (categoryPattern("relocation").test(normalized)) return "relocation";
  if (categoryPattern("onsite_hybrid").test(normalized)) return "onsite_hybrid";
  if (categoryPattern("location").test(normalized)) return "location";
  if (categoryPattern("required_experience").test(normalized)) return "required_experience";
  if (categoryPattern("must_have_skill").test(normalized)) return "must_have_skill";
  if (/(do you have|have you|experience with|tell us about|describe your experience|required qualification)/i.test(normalized)) return "custom";
  return null;
}

function categoryPattern(category: AshbyRiskCategory) {
  const patterns: Record<AshbyRiskCategory, RegExp> = {
    work_authorization: /\b(authorized|authorised|eligible|right|permission)\b.*\b(work|employment)\b|\bwork authorization\b|\blegally authorized\b/i,
    sponsorship: /\b(sponsor|sponsorship|visa|immigration|h-?1b|work permit)\b/i,
    location: /\b(location|where are you based|country|state|city|timezone|time zone)\b/i,
    relocation: /\b(relocat|move to|willing to move)\b/i,
    salary: /\b(salary|compensation|pay|expected comp|desired comp|base range|rate)\b/i,
    required_experience: /\b(years of experience|yrs of experience|how many years|minimum experience)\b/i,
    must_have_skill: /\b(react|typescript|javascript|graphql|node|aws|python|design system|accessibility|security|saas)\b/i,
    onsite_hybrid: /\b(onsite|on-site|hybrid|in office|office days|commute)\b/i,
    custom: /\b(do you have|have you|experience with|describe your experience|tell us about)\b/i,
  };
  return patterns[category];
}

function includesTerm(text: string, term: string) {
  const normalizedText = normalize(text);
  const normalizedTerm = normalize(term).replace(/\./g, "");
  if (/\d\+ years/.test(normalizedTerm)) return new RegExp(`\\b${normalizedTerm.replace("+", "\\+?")}\\b`).test(normalizedText);
  return normalizedText.includes(normalizedTerm);
}

function isLikelyUsJob(job: AshbyRiskInput["job"]) {
  const text = normalize(`${job.country ?? ""} ${job.location ?? ""} ${job.remoteType ?? ""}`);
  return /\b(united states|usa|u s|us|remote us|remote)\b/.test(text) && !/\b(canada|europe|emea|uk|germany|france|netherlands)\b/.test(text);
}

function isLikelyUsCandidate(location: string) {
  return /\b(united states|usa|u s|us|california|los angeles|new york|texas|washington|remote)\b/.test(location);
}

function hostFromUrl(value?: string | null) {
  if (!value) return "";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\w+#.]+/g, " ").replace(/\s+/g, " ").trim();
}
