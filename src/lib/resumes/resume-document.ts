export type ResumeDocument = {
  name: string;
  contactLine: string;
  headline: string;
  summary: string[];
  skills: string[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: string[];
  certifications: string[];
  otherSections: Array<{ title: string; lines: string[] }>;
};

export type ResumeExperience = {
  title: string;
  company?: string;
  role?: string;
  dates?: string;
  skills: string[];
  bullets: string[];
};

export type ResumeProject = {
  name: string;
  description: string;
  technologies: string[];
};

type ResumeSectionKey = keyof Pick<ResumeDocument, "summary" | "skills" | "experience" | "projects" | "education" | "certifications">;

const SECTION_ALIASES: Partial<Record<string, ResumeSectionKey>> = {
  summary: "summary",
  skills: "skills",
  "core skills": "skills",
  experience: "experience",
  "professional experience": "experience",
  projects: "projects",
  education: "education",
  certifications: "certifications",
};

export function parseResumeDocument(text: string): ResumeDocument {
  const lines = text.replace(/\r/g, "").split("\n");
  const firstLineIndex = lines.findIndex((line) => line.trim());
  const name = firstLineIndex === -1 ? "" : stripMarkdown(lines[firstLineIndex]).trim();
  let bodyStart = firstLineIndex === -1 ? 0 : firstLineIndex + 1;
  const contactParts: string[] = [];

  for (let index = bodyStart; index < Math.min(lines.length, bodyStart + 5); index += 1) {
    const trimmed = stripMarkdown(lines[index]).trim();
    if (!trimmed) {
      bodyStart = index + 1;
      continue;
    }
    if (/@|https?:\/\/|\blinkedin\.com\b|\bgithub\.com\b|\|/.test(trimmed)) {
      contactParts.push(...trimmed.split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean));
      bodyStart = index + 1;
      continue;
    }
    break;
  }

  const sections = collectSections(lines.slice(bodyStart));
  const experience = parseExperience(sections.experience ?? []);
  const projects = parseProjects(sections.projects ?? []);
  const headline = firstExperienceRole(experience) ?? "Senior Software Engineer";
  const sectionSkills = parseSkills(sections.skills ?? []);

  return {
    name,
    contactLine: contactParts.join(" | "),
    headline,
    summary: cleanBodyLines(sections.summary ?? []),
    skills: mergeResumeSkills(sectionSkills, projects.flatMap((project) => project.technologies)),
    experience,
    projects,
    education: cleanBodyLines(sections.education ?? []),
    certifications: cleanBodyLines(sections.certifications ?? []),
    otherSections: sections.otherSections,
  };
}

function collectSections(lines: string[]) {
  const sections: Partial<Record<ResumeSectionKey, string[]>> & { otherSections: Array<{ title: string; lines: string[] }> } = {
    otherSections: [],
  };
  let currentTitle = "";
  let currentKey: ResumeSectionKey | "other" = "summary";
  let otherLines: string[] = [];

  const flushOther = () => {
    if (currentKey === "other" && currentTitle && otherLines.length) {
      sections.otherSections.push({ title: currentTitle, lines: cleanBodyLines(otherLines) });
      otherLines = [];
    }
  };

  for (const rawLine of lines) {
    const line = stripMarkdown(rawLine).trim();
    const heading = normalizedHeading(line);
    if (heading) {
      flushOther();
      currentTitle = line;
      currentKey = SECTION_ALIASES[heading] ?? "other";
      if (currentKey !== "other" && !Array.isArray(sections[currentKey])) sections[currentKey] = [];
      continue;
    }
    if (currentKey === "other") otherLines.push(rawLine);
    else {
      const current = sections[currentKey] ?? [];
      current.push(rawLine);
      sections[currentKey] = current;
    }
  }
  flushOther();
  return sections;
}

function parseExperience(lines: string[]): ResumeExperience[] {
  const entries: ResumeExperience[] = [];
  let current: ResumeExperience | null = null;

  const pushCurrent = () => {
    if (current) entries.push(current);
  };

  for (const rawLine of lines) {
    const line = stripMarkdown(rawLine).trim();
    if (!line) continue;
    if (isRoleLine(line)) {
      pushCurrent();
      current = roleEntry(line);
      continue;
    }
    if (!current) {
      current = roleEntry(line);
      continue;
    }
    if (/^skills\s*:/i.test(line)) {
      current.skills.push(...line.replace(/^skills\s*:/i, "").split(",").map((skill) => skill.trim()).filter(Boolean));
      continue;
    }
    if (/^[-*]\s+/.test(line)) current.bullets.push(line.replace(/^[-*]\s+/, ""));
    else current.bullets.push(line);
  }
  pushCurrent();
  return entries;
}

function roleEntry(line: string): ResumeExperience {
  const [title, dates] = splitLast(line, " | ");
  const [company, role] = splitLast(title, " - ");
  return {
    title,
    company,
    role,
    dates,
    skills: [],
    bullets: [],
  };
}

function parseSkills(lines: string[]) {
  return cleanBodyLines(lines)
    .flatMap((line) => line.replace(/^skills\s*:/i, "").split(/,|\s{2,}|\|/))
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function parseProjects(lines: string[]): ResumeProject[] {
  const projects: ResumeProject[] = [];
  for (const line of cleanBodyLines(lines)) {
    const bullet = line.replace(/^[-*]\s+/, "");
    const colon = bullet.indexOf(":");
    if (colon > 1 && colon < 72) {
      const parsed = parseProjectDescription(bullet.slice(colon + 1).trim());
      projects.push({ name: bullet.slice(0, colon).trim(), ...parsed });
    } else if (projects.length && projects[projects.length - 1].description.length < 600) {
      const project = projects[projects.length - 1];
      const parsed = parseProjectDescription(`${project.description} ${bullet}`.trim());
      project.description = parsed.description;
      project.technologies = uniqueSkills([...project.technologies, ...parsed.technologies]);
    } else {
      projects.push({ name: bullet, description: "", technologies: [] });
    }
  }
  return projects;
}

function parseProjectDescription(value: string): Pick<ResumeProject, "description" | "technologies"> {
  const [description, stack] = splitLast(value, " | ");
  const technologies = stack && looksLikeTechnologyStack(stack) ? parseSkills([stack]) : [];
  return {
    description: technologies.length ? description : value,
    technologies,
  };
}

function looksLikeTechnologyStack(value: string) {
  const terms = parseSkills([value]);
  if (terms.length < 2) return false;
  return terms.some((term) => /react|typescript|next\.?js|node\.?js|prisma|postgres|redis|docker|openai|rag|mcp|langgraph|langchain|playwright|material ui|vitest|pgvector/i.test(term));
}

function mergeResumeSkills(sectionSkills: string[], projectSkills: string[]) {
  const prioritySectionSkills = sectionSkills.slice(0, 8);
  const remainingSectionSkills = sectionSkills.slice(8);
  return uniqueSkills([...prioritySectionSkills, ...projectSkills, ...remainingSectionSkills]);
}

function uniqueSkills(skills: string[]) {
  const seen = new Set<string>();
  return skills
    .map((skill) => skill.trim())
    .filter(Boolean)
    .filter((skill) => {
      const key = skill.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function firstExperienceRole(experience: ResumeExperience[]) {
  return experience.find((item) => item.role)?.role;
}

function cleanBodyLines(lines: string[]) {
  return lines.map((line) => stripMarkdown(line).trim()).filter(Boolean);
}

function stripMarkdown(line: string) {
  return line.replace(/^#{1,6}\s+/, "");
}

function normalizedHeading(line: string) {
  const normalized = line.replace(/:$/, "").toLowerCase();
  return SECTION_ALIASES[normalized] ? normalized : /^[A-Z][A-Z /&-]{2,}$/.test(line) ? normalized : null;
}

function isRoleLine(line: string) {
  return /^[A-Z0-9][A-Za-z0-9 .&'/(),-]+ - .+/.test(line) || /\s\|\s(?:present|current|now|[a-z]{3,9}\s+\d{4}|\d{4})/i.test(line);
}

function splitLast(value: string, separator: string): [string, string | undefined] {
  const index = value.lastIndexOf(separator);
  if (index === -1) return [value.trim(), undefined];
  return [value.slice(0, index).trim(), value.slice(index + separator.length).trim()];
}
