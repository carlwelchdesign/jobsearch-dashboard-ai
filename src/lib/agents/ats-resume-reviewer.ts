import type { GeneratedResume, GithubRepository, JobPosting, Prisma, UserProfile } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { prisma } from "@/lib/prisma";
import { checkAtsReadability } from "@/lib/resumes/ats";

export type AtsResumeReviewerInput = {
  jobPostingId: string;
  generatedResumeId: string;
  userId?: string;
};

export type AtsResumeReviewerOutput = {
  status: "PASS" | "NEEDS_REVIEW" | "BLOCKED";
  atsScore: number;
  recruiterScore: number;
  keywordCoverage: {
    matched: string[];
    missingImportant: string[];
    overused: string[];
  };
  formatWarnings: string[];
  recruiterRedFlags: string[];
  evidenceRisks: string[];
  recommendedEdits: string[];
  rewriteDecision: {
    applied: boolean;
    reason: string | null;
    confidence: number;
  };
  rewrittenMarkdown?: string;
  rewrittenPlainText?: string;
  summaryReview: string;
  experienceReview: string;
  skillsReview: string;
  finalRecommendation: string;
  confidence: number;
};

type ReviewContext = {
  job: Pick<JobPosting, "title" | "company" | "description">;
  resume: Pick<GeneratedResume, "markdown" | "plainText" | "atsChecks">;
  userProfile?: Pick<UserProfile, "email" | "phone" | "location" | "linkedinUrl" | "githubUrl" | "portfolioUrl"> | null;
  githubRepositories?: Pick<GithubRepository, "fullName" | "htmlUrl">[];
};

export async function runAtsResumeReviewerAgent(input: AtsResumeReviewerInput) {
  return runAgent<AtsResumeReviewerInput, AtsResumeReviewerOutput>({
    agentType: "ATS_RESUME_REVIEWER",
    input,
    userId: input.userId,
    execute: async () => {
      const [job, resume, user] = await Promise.all([
        prisma.jobPosting.findUnique({ where: { id: input.jobPostingId } }),
        prisma.generatedResume.findUnique({ where: { id: input.generatedResumeId } }),
        prisma.user.findFirst({
          where: input.userId ? { id: input.userId } : undefined,
          include: {
            profile: {
              include: {
                githubRepositories: { orderBy: [{ pushedAt: "desc" }, { stars: "desc" }], take: 30 },
              },
            },
          },
        }),
      ]);

      if (!job) throw new Error("Job posting not found.");
      if (!resume) throw new Error("Generated resume not found.");

      return reviewAtsResume({
        job,
        resume,
        userProfile: user?.profile ?? null,
        githubRepositories: user?.profile?.githubRepositories ?? [],
      });
    },
  });
}

export function reviewAtsResume({ job, resume, userProfile, githubRepositories = [] }: ReviewContext): AtsResumeReviewerOutput {
  const markdown = resume.markdown ?? "";
  const plainText = resume.plainText?.trim() ? resume.plainText : markdown.replace(/^#+\s/gm, "");
  const atsChecks = checkAtsReadability(plainText);
  const combined = `${markdown}\n${plainText}`;
  const formatWarnings = [...atsChecks.warnings];
  const recruiterRedFlags: string[] = [];
  const evidenceRisks: string[] = [];
  const recommendedEdits: string[] = [];

  if (/\b(Selected strengths for|Relevant strengths include|Selected for)\b/i.test(combined)) {
    recruiterRedFlags.push("Summary contains generated scaffold language that can look automated to recruiters.");
    recommendedEdits.push("Remove job-specific scaffold phrasing from the summary.");
  }
  if (new RegExp(`${escapeRegExp(job.title)}\\s*@\\s*${escapeRegExp(job.company)}|${escapeRegExp(job.company)}'?s\\s+${escapeRegExp(job.title)}`, "i").test(combined)) {
    recruiterRedFlags.push("Summary repeats the company and role title too mechanically.");
    recommendedEdits.push("Keep the summary focused on verified strengths without naming the exact job.");
  }
  if (/\b(likely|estimated|inferred|available at the time|best guess|probably)\b/i.test(combined)) {
    evidenceRisks.push("Resume contains inferred or uncertain technology/version language.");
    recommendedEdits.push("Remove inferred technology or version language unless it is explicitly approved.");
  }
  if (/https:\/\/(?:www\.)?linkedin\.com\/in\/(?:\s|\||$)/i.test(combined)) {
    formatWarnings.push("LinkedIn URL is incomplete.");
    recommendedEdits.push("Remove incomplete LinkedIn roots or replace them with a complete profile URL.");
  }
  if (!hasValidProfileLink(combined, "linkedin")) {
    formatWarnings.push("LinkedIn profile URL is missing from the resume contact line.");
    recommendedEdits.push("Add a complete LinkedIn profile URL to the contact line.");
  }
  if (/https:\/\/github\.com\/(?:\s|\||$)/i.test(combined)) {
    formatWarnings.push("GitHub URL is incomplete.");
    recommendedEdits.push("Remove incomplete GitHub roots or replace them with the root GitHub profile URL.");
  }
  if (/\|.+\|/.test(markdown) && /---/.test(markdown)) {
    formatWarnings.push("Markdown table formatting can parse poorly in ATS systems.");
    recommendedEdits.push("Use plain headings and bullets instead of tables.");
  }

  const requiredSections = ["Summary", "Skills", "Professional Experience"];
  for (const section of requiredSections) {
    if (!new RegExp(`\\b${section}\\b`, "i").test(combined)) {
      formatWarnings.push(`${section} section is missing.`);
      recommendedEdits.push(`Add a clear ${section} section.`);
    }
  }

  const keywordCoverage = keywordCoverageFor(job, plainText);
  if (keywordCoverage.missingImportant.length) {
    recommendedEdits.push(`Review missing role keywords: ${keywordCoverage.missingImportant.slice(0, 6).join(", ")}.`);
  }
  if (!hasValidProfileLink(combined, "linkedin") && validLinkedinUrl(userProfile?.linkedinUrl)) {
    formatWarnings.push("Valid LinkedIn profile is available but missing from the resume contact line.");
    recommendedEdits.push("Add the LinkedIn profile URL to the contact line.");
  }
  if (!hasValidProfileLink(combined, "github") && (validGithubUrl(userProfile?.githubUrl) || githubProfileUrlFromRepositories(githubRepositories))) {
    formatWarnings.push("Valid GitHub profile is available but missing from the resume contact line.");
    recommendedEdits.push("Add the root GitHub profile URL to the contact line.");
  }
  const quantified = quantifiedAchievementCoverage(plainText);
  if (quantified.totalBullets >= 4 && quantified.quantifiedBullets < Math.min(3, Math.ceil(quantified.totalBullets * 0.25))) {
    recruiterRedFlags.push("Experience bullets have low quantified-achievement density.");
    recommendedEdits.push("Prefer approved bullets with numbers, percentages, dollar amounts, team size, countries, users, or delivery scale.");
  }
  const repeatedActionVerbs = repeatedResumeActionVerbs(plainText);
  if (repeatedActionVerbs.length) {
    recruiterRedFlags.push(`Repeated action verbs: ${repeatedActionVerbs.map((item) => `${item.word} (${item.count})`).join(", ")}.`);
    recommendedEdits.push("Vary repeated bullet openers with truthful synonyms such as guided, directed, managed, enhanced, expanded, or improved.");
  }

  const rewrittenMarkdown = rewriteResumeMarkdown(markdown, userProfile, githubRepositories);
  const rewrittenPlainText = rewrittenMarkdown.replace(/^#+\s/gm, "");
  const changed = rewrittenMarkdown.trim() !== markdown.trim();
  const clearFindings = recruiterRedFlags.filter((warning) => !/quantified-achievement density/i.test(warning)).length
    + evidenceRisks.length
    + formatWarnings.filter((warning) => /incomplete|valid .* missing from the resume contact line|scaffold|mechanically/i.test(warning)).length;
  const rewriteConfidence = changed && clearFindings > 0 ? 0.9 : 0.54;
  const shouldRewrite = changed && clearFindings > 0 && rewriteConfidence >= 0.86;
  const penalty = formatWarnings.length * 7 + recruiterRedFlags.length * 12 + evidenceRisks.length * 16 + Math.min(keywordCoverage.missingImportant.length, 6) * 3;
  const atsScore = Math.max(0, Math.min(100, atsChecks.score - formatWarnings.length * 4 - Math.min(keywordCoverage.missingImportant.length, 5) * 2));
  const recruiterScore = Math.max(0, Math.min(100, 100 - penalty));
  const status = evidenceRisks.length >= 2 || atsScore < 55 ? "BLOCKED" : recruiterScore < 82 || atsScore < 78 || keywordCoverage.missingImportant.length >= 5 ? "NEEDS_REVIEW" : "PASS";

  return {
    status,
    atsScore,
    recruiterScore,
    keywordCoverage,
    formatWarnings: unique(formatWarnings),
    recruiterRedFlags: unique(recruiterRedFlags),
    evidenceRisks: unique(evidenceRisks),
    recommendedEdits: unique(recommendedEdits),
    rewriteDecision: {
      applied: shouldRewrite,
      reason: shouldRewrite ? "Clear ATS/recruiter findings were corrected automatically." : null,
      confidence: rewriteConfidence,
    },
    ...(shouldRewrite ? { rewrittenMarkdown, rewrittenPlainText } : {}),
    summaryReview: recruiterRedFlags.length ? "Summary needs cleanup before recruiter review." : "Summary has no obvious recruiter-turnoff scaffold language.",
    experienceReview: /\bProfessional Experience\b/i.test(combined) ? "Professional experience section is present." : "Professional experience section is missing or hard to detect.",
    skillsReview: keywordCoverage.missingImportant.length ? "Some role keywords are not visible in the generated resume." : "Core role keywords are visible in the generated resume.",
    finalRecommendation: status === "PASS" ? "Resume looks ready for manual review." : "Review the flagged resume items before using this application packet.",
    confidence: combined.length > 1500 ? 0.84 : 0.68,
  };
}

export function atsResumeReviewJson(output: AtsResumeReviewerOutput, original: Pick<GeneratedResume, "markdown" | "plainText" | "html" | "atsChecks">) {
  return {
    ...output,
    original: output.rewriteDecision.applied
      ? {
          markdown: original.markdown,
          plainText: original.plainText,
          html: original.html,
          atsChecks: original.atsChecks,
        }
      : undefined,
    reviewedAt: new Date().toISOString(),
  } as Prisma.JsonObject;
}

function rewriteResumeMarkdown(markdown: string, userProfile?: ReviewContext["userProfile"], githubRepositories: ReviewContext["githubRepositories"] = []) {
  const contactLine = buildContactLine(userProfile, githubRepositories);
  let next = markdown
    .replace(/\s*Selected strengths for [^.]+ role include [^.]+\.?/gi, "")
    .replace(/\s*Selected for [^.]+ role based on verified experience and project evidence\.?/gi, "")
    .replace(/\s*Relevant strengths include [^.]+\.?/gi, "")
    .replace(/\s*https:\/\/(?:www\.)?linkedin\.com\/in\/(?=\s|\||$)\s*(?:\|\s*)?/gi, "")
    .replace(/\s*https:\/\/github\.com\/(?=\s|\||$)\s*(?:\|\s*)?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  next = removeUncertainResumeLanguage(next);
  next = varyRepeatedActionVerbs(next);

  if (contactLine) {
    next = enforceContactLine(next, contactLine);
  }
  return next;
}

function enforceContactLine(markdown: string, contactLine: string) {
  const lines = markdown.split("\n");
  const nameIndex = lines.findIndex((line) => line.trim());
  if (nameIndex === -1) return markdown;
  const nextContentIndex = lines.findIndex((line, index) => index > nameIndex && line.trim());
  if (nextContentIndex !== -1 && isContactLine(lines[nextContentIndex])) {
    lines[nextContentIndex] = mergeContactLines(lines[nextContentIndex], contactLine);
    return lines.join("\n").replace(/\n{3,}/g, "\n\n");
  }
  return [...lines.slice(0, nameIndex + 1), contactLine, "", ...lines.slice(nameIndex + 1)].join("\n").replace(/\n{3,}/g, "\n\n");
}

function isContactLine(line: string) {
  return /@|https?:\/\/|\blinkedin\.com\b|\bgithub\.com\b|\|/.test(line);
}

function mergeContactLines(existing: string, required: string) {
  const seen = new Set<string>();
  return [...existing.split(/\s*\|\s*/), ...required.split(/\s*\|\s*/)]
    .map((part) => part.trim())
    .filter((part) => {
      if (!part || /^https:\/\/(?:www\.)?linkedin\.com\/in\/?$/i.test(part) || /^https:\/\/github\.com\/?$/i.test(part)) return false;
      const key = part.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" | ");
}

function buildContactLine(userProfile?: ReviewContext["userProfile"], githubRepositories: ReviewContext["githubRepositories"] = []) {
  return [
    userProfile?.email,
    userProfile?.phone,
    userProfile?.location,
    validLinkedinUrl(userProfile?.linkedinUrl),
    validGithubUrl(userProfile?.githubUrl) ?? githubProfileUrlFromRepositories(githubRepositories),
    userProfile?.portfolioUrl,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

function validLinkedinUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("linkedin.com")) return url;
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[0]?.toLowerCase() === "in" && parts[1] ? `https://www.linkedin.com/in/${parts[1]}` : null;
  } catch {
    return /linkedin\.com\/in\/[^/\s]+/i.test(url) ? url : null;
  }
}

function validGithubUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("github.com")) return url;
    const owner = parsed.pathname.split("/").filter(Boolean)[0];
    return owner ? `https://github.com/${owner}` : null;
  } catch {
    return /github\.com\/[^/\s]+/i.test(url) ? url : null;
  }
}

function githubProfileUrlFromRepositories(repositories: ReviewContext["githubRepositories"] = []) {
  for (const repo of repositories) {
    const fromUrl = validGithubUrl(repo.htmlUrl);
    if (fromUrl) return fromUrl;
    const owner = repo.fullName.split("/").filter(Boolean)[0];
    if (owner) return `https://github.com/${owner}`;
  }
  return null;
}

function hasValidProfileLink(text: string, type: "linkedin" | "github") {
  return type === "linkedin" ? /https:\/\/(?:www\.)?linkedin\.com\/in\/[^/\s|]+/i.test(text) : /https:\/\/github\.com\/[^/\s|]+/i.test(text);
}

function quantifiedAchievementCoverage(text: string) {
  const bullets = text.split("\n").map((line) => line.trim()).filter((line) => /^[-*]\s+/.test(line));
  return {
    totalBullets: bullets.length,
    quantifiedBullets: bullets.filter((line) => hasQuantifiedAchievement(line)).length,
  };
}

function repeatedResumeActionVerbs(text: string) {
  const counts = new Map<string, number>();
  for (const line of bulletLines(text)) {
    const firstWord = line.replace(/^[-*]\s+/, "").match(/^[A-Za-z]+/)?.[0]?.toLowerCase();
    if (firstWord && trackedActionVerbSynonyms[firstWord]) counts.set(firstWord, (counts.get(firstWord) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 3)
    .map(([word, count]) => ({ word, count }));
}

function varyRepeatedActionVerbs(markdown: string) {
  const currentCounts = actionVerbCounts(markdown);
  const seenOriginals = new Map<string, number>();
  return markdown.split("\n").map((line) => {
    const match = line.match(/^(\s*[-*]\s+)([A-Za-z]+)\b(.*)$/);
    if (!match) return line;
    const verb = match[2].toLowerCase();
    const replacements = trackedActionVerbSynonyms[verb];
    if (!replacements) return line;
    const originalSeen = seenOriginals.get(verb) ?? 0;
    seenOriginals.set(verb, originalSeen + 1);
    if ((currentCounts.get(verb) ?? 0) <= 2 || originalSeen < 2) return line;
    const replacement = replacements.find((candidate) => (currentCounts.get(candidate) ?? 0) < 2);
    if (!replacement) return line;
    currentCounts.set(verb, Math.max(0, (currentCounts.get(verb) ?? 0) - 1));
    currentCounts.set(replacement, (currentCounts.get(replacement) ?? 0) + 1);
    return `${match[1]}${preserveCase(match[2], replacement)}${match[3]}`;
  }).join("\n");
}

function bulletLines(text: string) {
  return text.split("\n").map((line) => line.trim()).filter((line) => /^[-*]\s+/.test(line));
}

function actionVerbCounts(text: string) {
  const counts = new Map<string, number>();
  for (const line of bulletLines(text)) {
    const firstWord = line.replace(/^[-*]\s+/, "").match(/^[A-Za-z]+/)?.[0]?.toLowerCase();
    if (firstWord && trackedActionVerbSynonyms[firstWord]) counts.set(firstWord, (counts.get(firstWord) ?? 0) + 1);
  }
  return counts;
}

function removeUncertainResumeLanguage(markdown: string) {
  return markdown.split("\n").filter((line) => {
    if (!/^[-*]\s+/.test(line.trim())) return true;
    return !/\b(likely|estimated|inferred|available at the time|best guess|probably)\b/i.test(line);
  }).map((line) => line
    .replace(/\b(likely|estimated|inferred|available at the time|best guess|probably)\b\s*/gi, "")
    .replace(/\b(React|React Native|Angular|Vue|Node(?:\.js)?|TypeScript|JavaScript|Backbone|Next(?:\.js)?|Kubernetes|Docker|MUI|Material UI|Jest|Playwright|Storybook|Java|PHP|MySQL|Redis|Firebase|Twilio|GraphQL|REST|AWS|iOS|Android|Xcode)\s+\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?\b/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trimEnd()
  ).join("\n").replace(/\n{3,}/g, "\n\n");
}

const trackedActionVerbSynonyms: Record<string, string[]> = {
  led: ["guided", "directed", "oversaw", "steered", "advanced"],
  developed: ["enhanced", "expanded", "improved", "shaped", "produced"],
  built: ["created", "delivered", "implemented", "launched", "assembled"],
  created: ["established", "generated", "initiated", "produced", "designed"],
  delivered: ["presented", "provided", "distributed", "launched", "completed"],
  implemented: ["executed", "applied", "enforced", "introduced", "rolled out"],
  supported: ["assisted", "aided", "helped", "enabled", "backed"],
  coordinated: ["organized", "arranged", "managed", "aligned", "orchestrated"],
  managed: ["oversaw", "supervised", "directed", "coordinated", "guided"],
  reviewed: ["evaluated", "analyzed", "assessed", "audited", "inspected"],
  guided: ["directed", "steered", "advanced"],
  directed: ["guided", "oversaw", "steered"],
  enhanced: ["improved", "expanded", "strengthened"],
  expanded: ["enhanced", "improved", "broadened"],
  improved: ["enhanced", "strengthened", "advanced"],
};

function preserveCase(original: string, replacement: string) {
  return /^[A-Z]/.test(original) ? `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}` : replacement;
}

function hasQuantifiedAchievement(text: string) {
  return /\b\d+(?:\.\d+)?\s*(?:%|x|k|m|users?|developers?|countries?|teams?|markets?|brands?|studios?|networks?|applications?|campaigns?|sites?|screens?|features?|workflows?)(?![a-z])/i.test(text)
    || /\$\s?\d+(?:\.\d+)?\s?(?:k|m|b)?\b/i.test(text)
    || /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:developers?|countries?|teams?|markets?|brands?|studios?|networks?)\b/i.test(text);
}

function keywordCoverageFor(job: Pick<JobPosting, "title" | "description">, resumeText: string) {
  const jobText = `${job.title} ${job.description}`;
  const terms = importantTerms(jobText);
  const normalizedResume = resumeText.toLowerCase();
  const matched = terms.filter((term) => normalizedResume.includes(term.toLowerCase()));
  const missingImportant = terms.filter((term) => !normalizedResume.includes(term.toLowerCase()));
  const overused = terms.filter((term) => countOccurrences(normalizedResume, term.toLowerCase()) >= 12);
  return { matched, missingImportant, overused };
}

function importantTerms(text: string) {
  const known = [
    "React", "React Native", "TypeScript", "JavaScript", "Node", "API", "GraphQL", "REST", "AWS", "Docker", "Kubernetes",
    "Playwright", "Jest", "Storybook", "Material UI", "accessibility", "design systems", "frontend architecture", "SaaS",
    "security", "identity", "WebAuthn", "authentication", "admin console", "analytics", "dashboard", "CRM", "telephony",
  ];
  const lower = text.toLowerCase();
  return unique(known.filter((term) => lower.includes(term.toLowerCase()))).slice(0, 14);
}

function countOccurrences(text: string, term: string) {
  return text.split(term).length - 1;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
