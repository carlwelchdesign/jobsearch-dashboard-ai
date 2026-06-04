import type { ExperienceBullet, GithubRepository, JobPosting, Project, UserProfile, WorkExperience } from "@prisma/client";
import { parseStructuredOutput } from "@/lib/ai/openai";
import { parseResumeHeuristically } from "@/lib/resumes/parse";
import {
  generateCoverLetterSchema,
  parseUploadedResumeSchema,
  tailorResumeForJobSchema,
  validateGeneratedResumeSchema,
  type ParsedResume,
} from "@/lib/resumes/schemas";

type TailorResumeInput = {
  userProfile: UserProfile;
  job: JobPosting;
  bullets: ExperienceBullet[];
  projects: Project[];
  workExperiences?: WorkExperience[];
  githubRepositories?: GithubRepository[];
  education?: string[];
  certifications?: string[];
};

type GenerateCoverLetterInput = TailorResumeInput & {
  tailoredResumeMarkdown?: string | null;
  writingGuidance?: string[];
};

export async function parseUploadedResume(extractedText: string): Promise<ParsedResume> {
  try {
    const parsed = await parseStructuredOutput({
      schema: parseUploadedResumeSchema,
      schemaName: "parse_uploaded_resume",
      system:
        "Parse the uploaded resume into structured candidate data. Do not fabricate missing experience. " +
        "Every achievement, company, technology, and credential must trace back to the supplied resume text. " +
        "Use truthLevel 'needs_review' for any inferred bullet.",
      input: { extractedResumeText: extractedText },
    });

    if (parsed) return parsed;
  } catch (error) {
    console.warn("OpenAI resume parsing failed; using heuristic parser.", error);
  }

  return parseResumeHeuristically(extractedText);
}

export async function tailorResumeForJob({ userProfile, job, bullets, projects, workExperiences = [], githubRepositories = [], education = [], certifications = [] }: TailorResumeInput) {
  // Deduplicate projects by name and strip placeholder descriptions before feeding to AI or fallback
  const cleanProjects = deduplicateByName(projects).filter((p) => !isPlaceholderDescription(p.description));
  const fallback = buildFallbackTailoredResume({ userProfile, job, bullets, projects: cleanProjects, workExperiences, githubRepositories, education, certifications });

  try {
    const tailored = await parseStructuredOutput({
      schema: tailorResumeForJobSchema,
      schemaName: "tailor_resume_for_job",
      system:
        "Create an ATS-friendly tailored resume from only the approved candidate profile and verified bullets supplied. " +
        "Do not invent companies, dates, metrics, tools, credentials, or unsupported claims. " +
        "If the job asks for something the source profile does not support, add it to the warnings array — do NOT mention it in the resume text itself. " +
        "The plainTextResume and markdownResume fields must contain ONLY the resume document. " +
        "Never include warnings, notes, selected project lists, tailoring commentary, or any metadata inside the resume text fields. " +
        "Compose the resume like a premium editorial document: exact section hierarchy, concise high-signal bullets, clean role/date lines, and no filler. " +
        "Use these sections in this order when supported by the source data: Summary, Skills, Professional Experience, Projects, Education, Certifications. " +
        "Professional Experience role lines must follow 'Company - Role | Date range' when dates are available, then 3-5 concise bullets focused on outcomes, scope, tools, and measurable evidence already present in source data. " +
        "Do not omit any supplied workExperiences from Professional Experience. If a role is less relevant, keep the entry compact with 1-2 truthful bullets rather than creating an employment-date gap. " +
        "Verified bullets marked as profile updates or role-description digest evidence are recently approved user profile data. Give them strong consideration when they align with the job, even if older uploaded-resume bullets also match. " +
        "Keep the Summary to 2 polished sentences and the Skills section to a selective comma-separated list rather than a dense keyword dump. " +
        "In the contact line, list values only — no labels like 'Email:', 'Phone:', 'LinkedIn:'. Separate with ' | '. Use only the root GitHub profile URL (e.g. github.com/username) — never individual repository URLs. Include the LinkedIn URL if provided. " +
        "In the Projects section: write a concrete one-sentence description of what each project does, followed by the full technology stack (language, frameworks, libraries, services) drawn from the project's technologies, topics, and language fields — list every relevant technology, not just the primary language. Never copy placeholder text like 'Portfolio project referenced in uploaded resume.' " +
        "Do not list the same project twice. If a project appears in both the profile projects list and the GitHub repositories, include it only once using the richer of the two descriptions. " +
        "Do not include individual GitHub repository URLs in the resume — the candidate's GitHub profile is already in the contact line.",
      input: {
        candidateProfile: userProfile,
        verifiedExperienceBullets: bullets.map((bullet) => ({
          id: bullet.id,
          company: bullet.company,
          role: bullet.role,
          category: bullet.category,
          text: bullet.text,
          keywords: bullet.keywords,
          sourceText: bullet.sourceText,
          source: bullet.sourceResumeUploadId ? "resume_upload" : "profile_update",
          isRoleDescriptionDigest: isRoleDescriptionDigestBullet(bullet),
          createdAt: bullet.createdAt,
        })),
        workExperiences: workExperiences.map((work) => ({
          id: work.id,
          company: work.company,
          title: work.title,
          location: work.location,
          startDate: work.startDate,
          endDate: work.endDate,
          isCurrent: work.isCurrent,
          summary: work.summary,
          skills: work.skills,
          achievements: work.achievements,
          source: work.sourceResumeUploadId ? "resume_upload" : "profile_update",
        })),
        projects: cleanProjects.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          technologies: project.technologies,
          highlights: project.highlights,
        })),
        githubRepositories: githubRepositories.map((repo) => ({
          name: repo.name,
          fullName: repo.fullName,
          url: repo.htmlUrl,
          description: repo.description,
          language: repo.language,
          topics: repo.topics,
          pushedAt: repo.pushedAt,
        })),
        job: {
          company: job.company,
          title: job.title,
          location: job.location,
          description: job.description,
          requirements: job.requirements,
          niceToHaves: job.niceToHaves,
        },
      },
    });

    if (!tailored || !passesResumeQualityGate(tailored.plainTextResume)) return fallback;
    tailored.plainTextResume = stripResumeMetadata(tailored.plainTextResume);
    tailored.markdownResume = stripResumeMetadata(tailored.markdownResume);
    const continuity = enforceWorkHistoryContinuity(tailored.markdownResume, workExperiences, bullets);
    tailored.markdownResume = continuity.markdownResume;
    tailored.plainTextResume = continuity.markdownResume.replace(/^#+\s/gm, "");
    if (continuity.addedEntries.length) {
      tailored.warnings = [
        ...tailored.warnings,
        `Added compact Professional Experience entries for omitted employers: ${continuity.addedEntries.join(", ")}.`,
      ];
    }

    const validation = await parseStructuredOutput({
      schema: validateGeneratedResumeSchema,
      schemaName: "validate_generated_resume",
      system:
        "Validate whether this tailored resume is truthful against the source candidate profile and selected bullet ids. " +
        "Flag unsupported or weak claims. Do not be generous.",
      input: {
        generatedResume: tailored,
        sourceCandidateProfile: userProfile,
        selectedBulletIds: tailored.selectedExperienceBullets.map((selection) => selection.bulletId),
        sourceBullets: bullets.map((bullet) => ({ id: bullet.id, text: bullet.text })),
      },
    });

    return {
      ...tailored,
      validation,
      generatedBy: "openai_structured_outputs",
    };
  } catch (error) {
    console.warn("OpenAI resume tailoring failed; using deterministic fallback.", error);
    return fallback;
  }
}

export async function generateCoverLetterForJob({
  userProfile,
  job,
  bullets,
  projects,
  githubRepositories = [],
  tailoredResumeMarkdown,
  writingGuidance = [],
}: GenerateCoverLetterInput) {
  const fallback = buildFallbackCoverLetter({ userProfile, job, bullets, writingGuidance });

  try {
    const generated = await parseStructuredOutput({
      schema: generateCoverLetterSchema,
      schemaName: "generate_cover_letter",
      system:
        "Generate a concise, credible cover letter for this job. Use only the supplied approved candidate profile, verified bullets, projects, and tailored resume. " +
        "Follow supplied writing guidance unless it conflicts with truthfulness or the job data. " +
        "When referring to the user's job-search application generally, call it an Agentic job search assistant. " +
        "For AI-related roles, if mentioning that application, describe it as using agentic workflows, RAG, MCP, LangGraph, LangSmith-style observability, browser automation, email outcome tracking, application state reconciliation, duplicate detection, and learned feedback loops. " +
        "Do not fabricate experience, metrics, credentials, employers, dates, or domain claims. Avoid hype, cliches, em dashes, and obvious AI phrasing.",
      input: {
        company: job.company,
        job: {
          title: job.title,
          location: job.location,
          description: job.description,
          requirements: job.requirements,
          niceToHaves: job.niceToHaves,
        },
        candidateProfile: userProfile,
        verifiedExperienceBullets: bullets.map((bullet) => ({
          id: bullet.id,
          company: bullet.company,
          role: bullet.role,
          category: bullet.category,
          text: bullet.text,
          keywords: bullet.keywords,
        })),
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          technologies: project.technologies,
          highlights: project.highlights,
        })),
        githubRepositories: githubRepositories.map((repo) => ({
          name: repo.name,
          fullName: repo.fullName,
          url: repo.htmlUrl,
          description: repo.description,
          language: repo.language,
          topics: repo.topics,
          pushedAt: repo.pushedAt,
        })),
        tailoredResumeMarkdown,
        writingGuidance,
      },
    });

    return {
      ...(generated ?? fallback),
      generatedBy: generated ? "openai_structured_outputs" : fallback.generatedBy,
    };
  } catch (error) {
    console.warn("OpenAI cover letter generation failed; using deterministic fallback.", error);
    return fallback;
  }
}

// Normalize any GitHub URL to the profile root — strips /repo and deeper paths
function githubProfileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("github.com")) return url;
    const username = u.pathname.split("/").filter(Boolean)[0];
    return username ? `github.com/${username}` : null;
  } catch {
    return url;
  }
}

function buildFallbackTailoredResume({ userProfile, job, bullets, projects, workExperiences = [], githubRepositories = [], education = [], certifications = [] }: TailorResumeInput) {
  const skills = [
    ...jsonStringArray(userProfile.coreSkills),
    ...jsonStringArray(userProfile.technicalSkills),
  ];
  const jobTerms = tokenize(`${job.title} ${job.description}`);
  const rankedSkills = uniqueStrings(skills).sort((a, b) => scoreTerm(b, jobTerms) - scoreTerm(a, jobTerms)).slice(0, 32);
  const rankedBullets = uniqueBullets(bullets)
    .sort((a, b) => scoreTerm(b.text, jobTerms) - scoreTerm(a.text, jobTerms))
    .slice(0, 28);
  const selectedProjects = [...projects]
    .sort((a, b) => scoreTerm(`${b.name} ${b.description ?? ""}`, jobTerms) - scoreTerm(`${a.name} ${a.description ?? ""}`, jobTerms))
    .slice(0, 3);
  const projectNameKeys = new Set(selectedProjects.map((p) => p.name.toLowerCase().replace(/[-_\s]+/g, "")));
  const selectedRepos = [...githubRepositories]
    .filter((repo) => !repo.isFork && !projectNameKeys.has(repo.name.toLowerCase().replace(/[-_\s]+/g, "")))
    .sort((a, b) => scoreTerm(`${b.name} ${b.description ?? ""} ${jsonStringArray(b.topics).join(" ")} ${b.language ?? ""}`, jobTerms) - scoreTerm(`${a.name} ${a.description ?? ""} ${jsonStringArray(a.topics).join(" ")} ${a.language ?? ""}`, jobTerms))
    .slice(0, 4);
  const summaryBase = userProfile.professionalSummary ?? userProfile.masterSummary;
  const tailoredSummary = [
    summaryBase,
    rankedSkills.length
      ? `Selected strengths for ${job.company}'s ${job.title} role include ${rankedSkills.slice(0, 5).join(", ")}.`
      : `Selected for ${job.company}'s ${job.title} role based on verified experience and project evidence.`,
  ]
    .filter(Boolean)
    .map((part) => part.trim())
    .join(" ");
  const contactLine = [
    userProfile.email,
    userProfile.phone,
    userProfile.location,
    userProfile.linkedinUrl,
    githubProfileUrl(userProfile.githubUrl),
    userProfile.portfolioUrl,
  ]
    .filter((value) => value && value !== "https://")
    .join(" | ");
  const markdownResume = [
    `# ${userProfile.fullName}`,
    contactLine,
    "",
    "## Summary",
    tailoredSummary,
    "",
    "## Skills",
    rankedSkills.slice(0, 24).join(", ") || "React, TypeScript, JavaScript, frontend architecture, product engineering",
    "",
    "## Professional Experience",
    ...formatExperience(rankedBullets, workExperiences),
    "",
    "## Projects",
    ...selectedProjects.map((project) => {
      const techs = jsonStringArray(project.technologies);
      const techStr = techs.length ? ` | ${techs.join(", ")}` : "";
      return `- ${project.name}: ${project.description ?? ""}${techStr}`;
    }),
    ...selectedRepos.map((repo) => {
      const topics = jsonStringArray(repo.topics);
      const lang = repo.language ?? "";
      const stack = [lang, ...topics.filter((t) => t.toLowerCase() !== lang.toLowerCase())].filter(Boolean);
      return `- ${repo.name}: ${[repo.description, stack.join(", ")].filter(Boolean).join(" | ")}`;
    }),
    ...(education.length ? ["", "## Education", ...education.map((item) => `- ${item}`)] : []),
    ...(certifications.length ? ["", "## Certifications", ...certifications.map((item) => `- ${item}`)] : []),
  ].join("\n");

  return {
    tailoredSummary,
    selectedSkills: rankedSkills,
    selectedExperienceBullets: rankedBullets.map((bullet) => ({
      bulletId: bullet.id,
      rationale: "Selected by keyword overlap with the job title and description.",
    })),
    projectSelections: selectedProjects.map((project) => ({
      projectId: project.id,
      rationale: "Selected by keyword overlap with the job title and description.",
    })),
    keywordAlignment: {
      matchedTerms: rankedSkills.filter((skill) => scoreTerm(skill, jobTerms) > 0),
      method: "deterministic_keyword_overlap",
    },
    markdownResume,
    plainTextResume: markdownResume.replace(/^#+\s/gm, ""),
    warnings: [],
    unsupportedClaimsDetected: [],
    validation: null,
    generatedBy: "deterministic_fallback",
  };
}

// Strip AI metadata that occasionally leaks into the resume text fields.
// Warnings, selection rationale, tailoring notes, and commentary must never
// appear in the rendered document.
function stripResumeMetadata(text: string): string {
  const metadataMarkers = [
    /^selected projects:\s*$/i,
    /^warnings?:\s*$/i,
    /^notes?:\s*$/i,
    /^tailoring (note|summary):\s*$/i,
    /^generation (note|summary):\s*$/i,
    /^this resume (is|was|has been) tailored/i,
    /^the (above |following )?resume (is|was) tailored/i,
    /^i (have |'ve )?(tailored|customized|adapted)/i,
  ];
  const lines = text.split("\n");
  const cutoff = lines.findIndex((line) => metadataMarkers.some((pattern) => pattern.test(line.trim())));
  return (cutoff === -1 ? lines : lines.slice(0, cutoff)).join("\n").trimEnd();
}

function passesResumeQualityGate(plainText: string) {
  const bulletCount = (plainText.match(/^- /gm) ?? []).length;
  return plainText.length >= 1800 && bulletCount >= 8 && /\bSkills\b/i.test(plainText) && /\bProfessional Experience\b/i.test(plainText);
}

function uniqueBullets(bullets: ExperienceBullet[]) {
  const seen = new Set<string>();
  return bullets.filter((bullet) => {
    const key = bullet.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRoleDescriptionDigestBullet(bullet: ExperienceBullet) {
  return Boolean(
    bullet.metrics &&
      typeof bullet.metrics === "object" &&
      !Array.isArray(bullet.metrics) &&
      "source" in bullet.metrics &&
      bullet.metrics.source === "role_description_digest",
  );
}

function formatExperience(bullets: ExperienceBullet[], workExperiences: WorkExperience[]) {
  const chronologicalWork = sortWorkExperiences(workExperiences);
  const workByKey = new Map(chronologicalWork.map((work) => [workKey(work.company, work.title), work]));
  const groups = new Map<string, ExperienceBullet[]>();
  for (const bullet of bullets) {
    const key = workKey(bullet.company, bullet.role);
    groups.set(key, [...(groups.get(key) ?? []), bullet]);
  }

  for (const work of chronologicalWork) {
    const key = workKey(work.company, work.title);
    if (!groups.has(key)) groups.set(key, []);
  }

  const groupEntries = Array.from(groups.entries()).sort(([leftKey], [rightKey]) => {
    const leftWork = workByKey.get(leftKey);
    const rightWork = workByKey.get(rightKey);
    const leftDate = workSortValue(leftWork);
    const rightDate = workSortValue(rightWork);
    if (leftDate !== rightDate) return rightDate - leftDate;
    return leftKey.localeCompare(rightKey);
  });

  return groupEntries.flatMap(([key, group]) => {
    const work = workByKey.get(key);
    const [company, role] = work ? [work.company, work.title] : displayKeyParts(key);
    const dates = work?.startDate || work?.endDate ? ` | ${[work.startDate, work.endDate].filter(Boolean).join(" - ")}` : "";
    const bulletsForRole = group.length ? group.map((bullet) => bullet.text) : fallbackWorkBullets(work);
    return [`### ${company} - ${role}${dates}`, ...bulletsForRole.map((bullet) => `- ${bullet}`), ""];
  });
}

function enforceWorkHistoryContinuity(markdownResume: string, workExperiences: WorkExperience[], bullets: ExperienceBullet[]) {
  const chronologicalWork = sortWorkExperiences(workExperiences);
  if (!chronologicalWork.length) return { markdownResume, addedEntries: [] as string[] };

  const existingText = normalizeWorkKey(markdownResume);
  const missingWork = chronologicalWork.filter((work) => !existingText.includes(normalizeWorkKey(work.company)));
  if (!missingWork.length) return { markdownResume, addedEntries: [] as string[] };

  const sourceBulletsByKey = new Map<string, ExperienceBullet[]>();
  for (const bullet of uniqueBullets(bullets)) {
    const key = workKey(bullet.company, bullet.role);
    sourceBulletsByKey.set(key, [...(sourceBulletsByKey.get(key) ?? []), bullet]);
  }

  const additions = missingWork.flatMap((work) => {
    const dates = work.startDate || work.endDate ? ` | ${[work.startDate, work.endDate].filter(Boolean).join(" - ")}` : "";
    const roleBullets = sourceBulletsByKey.get(workKey(work.company, work.title))?.map((bullet) => bullet.text) ?? fallbackWorkBullets(work);
    return [`### ${work.company} - ${work.title}${dates}`, ...roleBullets.slice(0, 2).map((bullet) => `- ${bullet}`), ""];
  });

  return {
    markdownResume: appendToProfessionalExperience(markdownResume, additions),
    addedEntries: missingWork.map((work) => work.company),
  };
}

function appendToProfessionalExperience(markdownResume: string, additions: string[]) {
  const lines = markdownResume.split("\n");
  const start = lines.findIndex((line) => /^##\s+Professional Experience\s*$/i.test(line.trim()));
  if (start === -1) return [markdownResume.trimEnd(), "", "## Professional Experience", ...additions].join("\n");
  const nextSection = lines.findIndex((line, index) => index > start && /^##\s+\S/.test(line.trim()));
  const insertAt = nextSection === -1 ? lines.length : nextSection;
  return [...lines.slice(0, insertAt), ...additions, ...lines.slice(insertAt)].join("\n").trimEnd();
}

function fallbackWorkBullets(work: WorkExperience | undefined) {
  if (!work) return ["Held a verified role in the candidate's employment history."];
  const achievements = jsonStringArray(work.achievements).filter(Boolean);
  if (achievements.length) return achievements.slice(0, 2);
  if (work.summary?.trim()) return [work.summary.trim()];
  const skills = jsonStringArray(work.skills).slice(0, 6);
  if (skills.length) return [`Worked across ${skills.join(", ")} in this verified role.`];
  return ["Verified role included for employment-history continuity."];
}

function sortWorkExperiences(workExperiences: WorkExperience[]) {
  const seen = new Set<string>();
  return [...workExperiences]
    .sort((a, b) => {
      const dateDiff = workSortValue(b) - workSortValue(a);
      if (dateDiff !== 0) return dateDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .filter((work) => {
      const key = `${workKey(work.company, work.title)}|${work.startDate ?? ""}|${work.endDate ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function workSortValue(work: WorkExperience | undefined) {
  if (!work) return 0;
  return Math.max(parseResumeDate(work.endDate, work.isCurrent), parseResumeDate(work.startDate, false));
}

function parseResumeDate(value: string | null | undefined, isCurrent: boolean) {
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

function workKey(company: string, title: string) {
  return `${normalizeWorkKey(company)}|${normalizeWorkKey(title)}`;
}

function normalizeWorkKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function displayKeyParts(key: string) {
  const [company, role] = key.split("|");
  return [titleCase(company), titleCase(role)];
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildFallbackCoverLetter({ userProfile, job, bullets, writingGuidance = [] }: Pick<GenerateCoverLetterInput, "userProfile" | "job" | "bullets" | "writingGuidance">) {
  const strongestBullets = bullets.slice(0, 3).map((bullet) => bullet.text);
  const skills = [
    ...jsonStringArray(userProfile.coreSkills),
    ...jsonStringArray(userProfile.technicalSkills),
  ].slice(0, 8);
  const body = [
    `Dear ${job.company} hiring team,`,
    "",
    `I am interested in the ${job.title} role. My background is strongest in ${skills.join(", ")}, with a focus on building practical product interfaces that are maintainable, testable, and useful for experienced users.`,
    "",
    strongestBullets.length
      ? `Relevant examples from my approved profile include: ${strongestBullets.join(" ")}`
      : userProfile.professionalSummary ?? userProfile.masterSummary,
    aiRelatedJob(job) && writingGuidance.some((guidance) => /agentic job search assistant|agentic workflows|rag|mcp|langgraph/i.test(guidance))
      ? "\nOne relevant example is my Agentic job search assistant, which uses agentic workflows, RAG, MCP, LangGraph, LangSmith-style observability, browser automation, email outcome tracking, application state reconciliation, duplicate detection, and learned feedback loops to review jobs against my actual experience, prepare tailored materials, track decisions, and surface better-fit opportunities over time."
      : "",
    "",
    `I would welcome a conversation about how this experience maps to ${job.company}'s needs for this role.`,
    "",
    `Best,`,
    userProfile.fullName,
  ].join("\n");

  return {
    body,
    toneNotes: ["Concise deterministic fallback generated from approved profile data."],
    warnings: [],
    unsupportedClaimsDetected: [],
    generatedBy: "deterministic_fallback",
  };
}

function aiRelatedJob(job: JobPosting) {
  return /\b(ai|artificial intelligence|machine learning|ml|llm|agentic|rag|langchain|langgraph|automation)\b/i.test([
    job.title,
    job.description,
    job.requirements,
    job.niceToHaves,
  ].filter(Boolean).join(" "));
}

function deduplicateByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.toLowerCase().replace(/[-_\s]+/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isPlaceholderDescription(description: string | null | undefined): boolean {
  if (!description) return false;
  return /portfolio project referenced|referenced in (uploaded )?resume/i.test(description);
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function tokenize(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9+#.]+/g) ?? []);
}

function scoreTerm(value: string, terms: Set<string>) {
  let score = 0;
  for (const term of tokenize(value)) {
    if (terms.has(term)) score += 1;
  }
  return score;
}
