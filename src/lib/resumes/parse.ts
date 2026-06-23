import { parseUploadedResumeSchema, type ParsedResume } from "./schemas";

const skillTerms = [
  "React",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "React Native",
  "Redux",
  "Redux-Saga",
  "Material UI",
  "Storybook",
  "React Hook Form",
  "Jest",
  "Playwright",
  "OpenAPI",
  "API integrations",
  "Mock Service Worker",
  "MSW",
  "AWS Lambda",
  "ElasticSearch",
  "Kafka",
  "WebAuthn",
  "passkeys",
  "identity",
  "security",
  "SaaS",
  "design system",
  "component library",
  "analytics",
  "developer experience",
  "frontend architecture",
  "VR",
  "AR",
  "defense",
];

const sectionHeaderAliases = new Map([
  ["SUMMARY", "SUMMARY"],
  ["CORE SKILLS", "SKILLS"],
  ["SKILLS", "SKILLS"],
  ["PROFESSIONAL EXPERIENCE", "EXPERIENCE"],
  ["PROFESSIONAL EXPERIENCE CONTINUED", "EXPERIENCE"],
  ["EARLIER EXPERIENCE", "EXPERIENCE"],
  ["EXPERIENCE", "EXPERIENCE"],
  ["EDUCATION", "EDUCATION"],
  ["CERTIFICATIONS", "CERTIFICATIONS"],
  ["PROJECTS", "PROJECTS"],
]);

type ParsedWork = {
  company: string;
  title: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
  summary?: string;
  skills: string[];
  achievements: string[];
};

type ParsedHeader = {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  consumedLines: number;
};

export function parseResumeHeuristically(extractedText: string): ParsedResume {
  const lines = normalizeLines(extractedText);
  const email = extractedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = extractedText.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0];
  const linkedinUrl = extractedText.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0];
  const githubUrl = extractedText.match(/https?:\/\/(?:www\.)?github\.com\/[^\s)]+/i)?.[0];
  const portfolioUrl = extractedText.match(/https?:\/\/(?!.*(?:linkedin|github))[^\s)]+/i)?.[0];
  const fullName = lines.find((line) => !line.includes("@") && !line.startsWith("http") && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(line)) ?? lines[0];
  const summary = extractSection(lines, "SUMMARY", ["SKILLS", "EXPERIENCE", "EDUCATION", "CERTIFICATIONS", "PROJECTS"]).join(" ");
  const detectedSkills = unique([
    ...skillTerms.filter((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(extractedText)),
    ...extractSkillsSection(lines),
  ]);
  const workExperience = extractWorkExperience(lines, detectedSkills);
  const experienceBullets = workExperience.flatMap((work) =>
    work.achievements.map((achievement) => ({
      company: work.company,
      role: work.title,
      text: achievement,
      category: inferCategory(achievement),
      metrics: extractMetrics(achievement),
      keywords: detectedSkills.filter((skill) => achievement.toLowerCase().includes(skill.toLowerCase())),
      sourceText: achievement,
      truthLevel: "verified" as const,
    })),
  );

  return parseUploadedResumeSchema.parse({
    contactInfo: {
      fullName,
      email,
      phone,
      linkedinUrl,
      githubUrl,
      portfolioUrl,
    },
    professionalSummary: summary || lines.slice(0, 4).join(" "),
    skills: {
      coreSkills: detectedSkills.slice(0, 18),
      technicalSkills: detectedSkills,
      toolsFrameworksLibraries: detectedSkills.filter((skill) => /React|Material|Storybook|Playwright|OpenAPI|MSW|Redux|Jest|Kafka|Elastic/i.test(skill)),
      programmingLanguages: detectedSkills.filter((skill) => /TypeScript|JavaScript|Node/i.test(skill)),
    },
    workExperience,
    experienceBullets,
    projects: extractProjects(lines, githubUrl, detectedSkills),
    education: extractSection(lines, "EDUCATION", ["SKILLS", "CERTIFICATIONS", "PROJECTS"]).filter((line) => !isSectionHeader(line)),
    certifications: extractSection(lines, "CERTIFICATIONS", ["SKILLS", "PROJECTS"]),
    inferredTags: detectedSkills,
    fieldsNeedingReview: experienceBullets.length < 8 ? ["experienceBullets"] : [],
    confidence: workExperience.length >= 5 && experienceBullets.length >= 15 ? 0.86 : 0.68,
  });
}

function normalizeLines(text: string) {
  const raw = text
    .replace(/\r/g, "")
    .replace(/\u2022/g, "\n• ")
    .replace(/#(?=[A-Z])/g, "\n• ")
    .replace(/\s+(SUMMARY|CORE SKILLS|PROFESSIONAL EXPERIENCE(?: CONTINUED)?|EARLIER EXPERIENCE|EDUCATION|CERTIFICATIONS|PROJECTS)\b/g, "\n$1")
    .replace(/\s+(Skills:\s*)/g, "\n$1")
    .replace(/\s+([A-Z][A-Za-z0-9&./' ]{1,60}\s+-\s+[^|\n]{3,80}\s+\|\s+(?:[A-Z][a-z]{2,8}\.?\s*)?\d{4}\s*[-–]\s*(?:(?:[A-Z][a-z]{2,8}\.?\s*)?\d{4}|Present|Current))/g, "\n$1")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/^Carl Welch - page(?: \d+)?(?: of \d+)?$/i.test(line))
    .filter((line) => !/^(?:of )?\d+$/.test(line));

  const lines: string[] = [];
  for (const line of raw) {
    const previous = lines[lines.length - 1];
    if (
      previous &&
      !isSectionHeader(previous) &&
      !isSectionHeader(line) &&
      !isBullet(line) &&
      !looksLikeJobHeader(line) &&
      !looksLikeDateLine(line) &&
      shouldJoin(previous, line)
    ) {
      lines[lines.length - 1] = `${previous} ${line}`;
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function shouldJoin(previous: string, line: string) {
  if (previous.endsWith(".") || previous.endsWith(":")) return false;
  if (isBullet(previous) && /^[A-Z]/.test(line)) return false;
  if (previous.length < 70) return false;
  if (/^[A-Z][A-Za-z .&/-]+,\s/.test(line)) return false;
  return true;
}

function extractWorkExperience(lines: string[], detectedSkills: string[]) {
  const start = lines.findIndex((line) => canonicalSection(line) === "EXPERIENCE");
  const end = findNextSection(lines, start + 1, ["EDUCATION", "SKILLS", "CERTIFICATIONS", "PROJECTS"]);
  const fallbackStart = lines.findIndex((line, index) => parseJobHeader(line, lines[index + 1], lines[index + 2]));
  const experienceLines = start === -1
    ? lines.slice(fallbackStart === -1 ? lines.length : fallbackStart)
    : lines.slice(start + 1, end === -1 ? lines.length : end);
  const work: ParsedWork[] = [];
  let current: ParsedWork | null = null;

  for (let index = 0; index < experienceLines.length; index += 1) {
    const line = experienceLines[index];
    if (isSectionHeader(line)) continue;

    const next = experienceLines[index + 1];
    const header = parseJobHeader(line, next, experienceLines[index + 2]);
    if (header) {
      if (current) work.push(current);
      current = {
        company: header.company,
        title: header.title,
        startDate: header.startDate,
        endDate: header.endDate,
        isCurrent: /present|current/i.test(header.endDate ?? ""),
        skills: [],
        achievements: [],
      };
      index += header.consumedLines;
      continue;
    }

    if (!current) continue;

    const splitRoleSkills = /^Skills:\s*$/i.test(line) ? commaList(experienceLines[index + 1] ?? "") : null;
    const roleSkills = splitRoleSkills ?? parseSkillsLine(line);
    if (roleSkills) {
      current.skills = unique([...current.skills, ...roleSkills]);
      if (splitRoleSkills) index += 1;
    } else if (isBullet(line)) {
      const achievement = cleanBullet(line);
      current.achievements.push(achievement);
      current.skills = unique([...current.skills, ...detectedSkills.filter((skill) => achievement.toLowerCase().includes(skill.toLowerCase()))]);
    } else if (!looksLikeDateLine(line) && line.length > 30) {
      current.achievements.push(cleanBullet(line));
    }
  }

  if (current) work.push(current);
  return work;
}

function parseJobHeader(line: string, next?: string, following?: string): ParsedHeader | null {
  const generated = line.match(/^(.+?)\s+-\s+(.+?)\s+\|\s+(.+)$/);
  if (generated && looksLikeDateLine(generated[3])) {
    const parsed = headerFromParts(generated[1], generated[2], parseDates(generated[3]), 0);
    if (parsed) return parsed;
  }

  const generatedSplitDate = line.match(/^(.+?)\s+-\s+(.+)$/);
  if (generatedSplitDate && next && /^\|\s+/.test(next) && looksLikeDateLine(next)) {
    return headerFromParts(generatedSplitDate[1], generatedSplitDate[2], parseDates(next), 1);
  }

  const inline = line.match(/^(.+?),\s*(.+?),?\s*((?:[A-Z][a-z]{2,8}|\d{4}).*)$/);
  if (inline && looksLikeDateLine(inline[3])) {
    const dates = parseDates(inline[3]);
    return headerFromParts(inline[1], inline[2], dates, 0);
  }

  const companyRole = line.match(/^(.+?),\s*(.+)$/);
  if (companyRole && next && looksLikeDateLine(next)) {
    return headerFromParts(companyRole[1], companyRole[2], parseDates(next), 1);
  }

  if (next && following && /,$/.test(line) && looksLikeRole(next) && looksLikeDateLine(following)) {
    return headerFromParts(line, next, parseDates(following), 2);
  }

  if (companyRole && /^[A-Z]/.test(line) && !isBullet(line) && !looksLikeDateLine(line) && looksLikeRole(companyRole[2]) && nearbyDate(next, following)) {
    return headerFromParts(companyRole[1], companyRole[2], {}, 0);
  }

  if (next && looksLikeRole(next) && /company|studios|llc|international|systems|bosch|bridg|yubico|revenue|grindr|sapient|taser|david/i.test(line)) {
    return headerFromParts(
      line.replace(/,\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4}).*$/i, ""),
      next,
      parseDates(line),
      1,
    );
  }

  return null;
}

function headerFromParts(companyValue: string, titleValue: string, dates: Partial<Pick<ParsedHeader, "startDate" | "endDate">>, consumedLines: number): ParsedHeader | null {
  const company = cleanCompany(companyValue);
  const title = titleValue.trim();
  if (!isPlausibleCompany(company) || !isPlausibleTitle(title)) return null;
  return {
    company,
    title,
    ...dates,
    consumedLines,
  };
}

function parseDates(value: string) {
  const match = value.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\.?\s*\d{4})\s*[-–]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\.?\s*\d{4}|Present|Current)/i);
  return {
    startDate: match?.[1]?.trim(),
    endDate: match?.[2]?.trim(),
  };
}

function extractSection(lines: string[], section: string, endSections: string[]) {
  const start = lines.findIndex((line) => canonicalSection(line) === section);
  if (start === -1) return [];
  const end = findNextSection(lines, start + 1, endSections);
  return lines.slice(start + 1, end === -1 ? lines.length : end).filter((line) => !isSectionHeader(line));
}

function findNextSection(lines: string[], start: number, sections: string[]) {
  return lines.findIndex((line, index) => {
    const section = canonicalSection(line);
    return index >= start && section !== null && sections.includes(section);
  });
}

function extractSkillsSection(lines: string[]) {
  return extractSection(lines, "SKILLS", ["EXPERIENCE", "EDUCATION", "CERTIFICATIONS", "PROJECTS"])
    .flatMap((line) => line.split(/\s*[•,|]\s*/))
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 2 && skill.length < 40 && !/^page$/i.test(skill));
}

function extractProjects(lines: string[], githubUrl: string | undefined, detectedSkills: string[]) {
  if (!githubUrl) return [];
  return [
    {
      name: "Progression Lab AI",
      description: "Portfolio project referenced in uploaded resume.",
      url: githubUrl,
      repoUrl: githubUrl,
      technologies: detectedSkills.filter((skill) => /React|TypeScript|JavaScript|Node|OpenAI|AI/i.test(skill)),
      highlights: [],
    },
  ];
}

function looksLikeJobHeader(line: string) {
  return Boolean(parseJobHeader(line)) || /^[A-Z][A-Za-z0-9 .&/-]+,\s*(Senior|Lead|Manager|Front|Art|Technical|Software|Interactive)/i.test(line);
}

function looksLikeDateLine(line: string) {
  return /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\.?\s*\d{4}\s*[-–]\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\.?\s*(?:\d{4}|Present|Current)/i.test(line);
}

function isSectionHeader(line: string) {
  return Boolean(canonicalSection(line));
}

function isBullet(line: string) {
  return /^[-*•#]/.test(line);
}

function looksLikeRole(value: string) {
  return /developer|engineer|manager|director|lead|software|frontend|full stack|art director|technical director|interactive development/i.test(value);
}

function canonicalSection(line: string) {
  const trimmed = line.trim().toUpperCase();
  if (trimmed === "SKILLS:") return null;
  const normalized = trimmed.replace(/:$/, "");
  return sectionHeaderAliases.get(normalized) ?? null;
}

function parseSkillsLine(line: string) {
  const match = line.match(/^Skills:\s*(.+)$/i);
  return match ? commaList(match[1]) : null;
}

function commaList(value: string) {
  return value.split(",").flatMap((item) => {
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}

function nearbyDate(next?: string, following?: string) {
  return Boolean((next && looksLikeDateLine(next)) || (following && looksLikeDateLine(following)));
}

function isPlausibleCompany(value: string) {
  if (!value || value.length > 70 || value.split(/\s+/).length > 8) return false;
  if (/^(React|TypeScript|JavaScript|Node\.js|Redux|Backbone|Angular|Skills)$/i.test(value)) return false;
  if (/senior software engineer|years of experience|building enterprise|developer platforms|mobile apps|analytics tools|strong background/i.test(value)) return false;
  return true;
}

function isPlausibleTitle(value: string) {
  if (!value || value.length > 90 || value.split(/\s+/).length > 10) return false;
  if (/^Skills:/i.test(value)) return false;
  if (/developer platforms|mobile apps|analytics tools|campaign platforms|strong background|REST APIs|Backend-for-Frontend/i.test(value)) return false;
  return looksLikeRole(value) || /contract/i.test(value);
}

function cleanCompany(value: string) {
  return value.replace(/^[-*•#]\s*/, "").replace(/,$/, "").trim();
}

function cleanBullet(line: string) {
  return line.replace(/^[-*•#]\s*/, "").replace(/\s*#\s*/g, " ").trim();
}

function inferCategory(text: string) {
  if (/security|identity|webauthn|passkey|auth|provisioning|device lifecycle/i.test(text)) return "security";
  if (/ai|openai|llm|model/i.test(text)) return "ai";
  if (/storybook|component|design system|material ui/i.test(text)) return "design_systems";
  if (/test|playwright|jest|msw|mock service worker/i.test(text)) return "testing";
  if (/data|visualization|analytics|dashboard|kafka|elasticsearch/i.test(text)) return "visualization";
  if (/node|api|backend|lambda|database|postgres|prisma|openapi/i.test(text)) return "fullstack";
  if (/led|managed|mentored|defined|presented/i.test(text)) return "leadership";
  if (/developer experience|tooling|platform/i.test(text)) return "devtools";
  return "frontend";
}

function extractMetrics(text: string): Record<string, string | number | boolean> {
  const matches = text.match(/\b\d+[%\d,]*(?:\s*(?:users|teams|applications|countries|files|datasets))?\b/g) ?? [];
  if (!matches.length) return {};
  return Object.fromEntries(matches.map((value, index) => [`metric_${index}`, value]));
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
