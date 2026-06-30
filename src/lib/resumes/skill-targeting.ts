export type ResumeSkillTargetingContext = {
  jobText?: string | null;
  evidenceText?: string | null;
  evidenceSkills?: string[];
};

const MUSIC_SKILL_KEYS = new Set([
  "chords",
  "guitar",
  "guitarchords",
  "music theory",
  "music tools",
  "piano",
  "piano chord",
  "piano chords",
  "pianochord",
  "pianochords",
]);

export function resumeSkillJobText(job: {
  title?: string | null;
  company?: string | null;
  description?: string | null;
}) {
  return [job.title, job.company, job.description].filter(Boolean).join(" ");
}

export function normalizeTargetedResumeSkills(
  skills: string[],
  context: ResumeSkillTargetingContext = {},
) {
  const jobText = context.jobText?.trim() ?? "";
  const allowMusicSkills = jobText
    ? isMusicRelevant(jobText)
    : isMusicRelevant(context.evidenceText ?? "");
  const preferLongMcp = /\bmodel context protocol\b/i.test(
    context.jobText ?? "",
  );
  const preferSse = /\b(server-sent events?|sse|eventsource)\b/i.test(
    context.jobText ?? "",
  );
  const seen = new Set<string>();

  const normalized = skills
    .map((skill) =>
      normalizeResumeSkillLabel(skill, { preferLongMcp, preferSse }),
    )
    .filter(Boolean)
    .filter((skill): skill is string => Boolean(skill))
    .filter(
      (skill) => allowMusicSkills || !MUSIC_SKILL_KEYS.has(skillKey(skill)),
    )
    .filter((skill) => {
      const key = skillKey(skill);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return includeRestApiSkill(normalized);
}

export function cleanResumeSkillsSection(
  text: string,
  context: ResumeSkillTargetingContext = {},
) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) =>
    /^#{0,6}\s*(?:skills|core skills|core competencies)\s*:?$/i.test(line.trim()),
  );
  if (start === -1) return text;

  const nextSection = lines.findIndex(
    (line, index) => index > start && isResumeSectionHeading(line),
  );
  const end = nextSection === -1 ? lines.length : nextSection;
  const skills = lines
    .slice(start + 1, end)
    .flatMap((line) =>
      line
        .replace(/^[-*]\s+/, "")
        .replace(/^skills\s*:/i, "")
        .split(/,|\s{2,}|\|/),
    )
    .map((skill) => skill.trim())
    .filter(Boolean);
  const normalized = normalizeTargetedResumeSkills(
    [...skills, ...(context.evidenceSkills ?? [])],
    context,
  );
  if (!normalized.length) return text;

  return [
    ...lines.slice(0, start + 1),
    normalized.join(", "),
    ...lines.slice(end),
  ].join("\n");
}

function isResumeSectionHeading(line: string) {
  const trimmed = line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/:$/, "");
  return /^(summary|professional experience|experience|projects|education|certifications)$/i.test(
    trimmed,
  );
}

function normalizeResumeSkillLabel(
  skill: string,
  { preferLongMcp, preferSse }: { preferLongMcp: boolean; preferSse: boolean },
) {
  const trimmed = skill.trim();
  if (!trimmed) return null;
  const key = skillKey(trimmed);

  if (
    key === "model context protocol" ||
    key === "model context protocol mcp" ||
    key === "mcp"
  ) {
    return preferLongMcp ? "Model Context Protocol" : "MCP";
  }
  if (
    key === "human in the loop" ||
    key === "human in the loop hitl" ||
    key === "hitl"
  ) {
    return "HITL";
  }
  if (key === "server sent events" || key === "sse" || key === "eventsource") {
    return preferSse ? "Server-Sent Events" : "real-time event streaming";
  }
  if (
    key === "rest api" ||
    key === "rest apis" ||
    key === "restapi" ||
    key === "restapis"
  ) {
    return "REST APIs";
  }
  if (key === "music theory") return "music-theory";
  return trimmed;
}

function includeRestApiSkill(skills: string[]) {
  if (skills.some((skill) => isRestApiSkill(skill))) return skills;
  const apiSkillIndex = skills.findIndex((skill) => isRestApiAdjacentSkill(skill));
  if (apiSkillIndex === -1) return skills;
  return [
    ...skills.slice(0, apiSkillIndex + 1),
    "REST APIs",
    ...skills.slice(apiSkillIndex + 1),
  ];
}

function isRestApiSkill(skill: string) {
  const key = skillKey(skill);
  return key === "rest api" || key === "rest apis" || key === "restapi" || key === "restapis";
}

function isRestApiAdjacentSkill(skill: string) {
  const key = skillKey(skill);
  return key === "api integrations" || key === "api design" || key === "backend for frontend";
}

function isMusicRelevant(value: string) {
  return /\b(music|audio|sound|song|songs|chord|chords|guitar|piano|instrument|musician|creator tool|creator tools|daw|midi)\b/i.test(
    value,
  );
}

function skillKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
