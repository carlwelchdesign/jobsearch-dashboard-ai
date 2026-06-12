type JobSummaryInput = {
  title: string;
  company: string;
  description?: string | null;
};

type SummarySection = {
  kind: "role" | "work" | "fit" | "company" | "other";
  text: string;
};

const maxSummaryLength = 260;
const invalidFormPattern = /\b(nameemail|resumeupload|upload fileor drag and drop|upload file|drag and drop|how did you hear|linkedin profile|github profile|phone numberresume|country you'?re currently residing)\b/i;
const companyHeadingPattern = /^(about the company|about us|who we are|company overview|about the team|our mission|benefits|perks|applying|eeo|equal opportunity)\b/i;
const roleHeadingPattern = /^(about the role|about the job|the role|this role|job description|description)\b/i;
const workHeadingPattern = /^(what you'?ll do|what you will do|responsibilities|what you'?ll work on|what you will work on|you will)\b/i;
const fitHeadingPattern = /^(requirements|qualifications|you may be a fit if|who you are|what we'?re looking for|what we are looking for)\b/i;
const roleVerbPattern = /\b(build|own|implement|lead|collaborate|design|develop|ship|architect|create|maintain|improve|support|manage|work across|work with)\b/i;
const boilerplatePattern = /\b(equal opportunity|reasonable accommodation|privacy policy|terms of use|all qualified applicants|background check|our mission is|our organization|our team is|first step in our journey|best tool for professional programmers|founded in|headquartered in)\b/i;
const applicationInstructionPattern = /\b(please include|with your application|submit your|apply now|applicants must|application will|interview process)\b/i;
const candidateTraitPattern = /\b(you have|you are|you love|you thrive|you want|we are looking for examples|writing samples|demonstrate your ability|ideal candidate|you may be a fit)\b/i;

export function summarizeApplicationJobDescription(input: JobSummaryInput) {
  const text = normalizeJobDescription(input.description);
  if (!text) return `${input.title} at ${input.company}; job description needs cleanup.`;
  if (invalidJobDescriptionText(text)) return "Job description unavailable; saved text appears to be the application form.";

  const sections = parseSections(text);
  const roleSentence = firstSentenceFromSections(sections, "role");
  const workSentence = firstSentenceFromSections(sections, "work");
  const selected = [roleSentence, workSentence].filter((item): item is string => Boolean(item));

  if (selected.length === 0 && sections.some((section) => section.kind !== "company" && section.kind !== "other")) {
    const fallback = firstRoleLikeSentenceAfterHeading(sections) ?? firstRoleLikeSentence(text);
    if (fallback) selected.push(fallback);
  }

  if (selected.length === 0) return `${input.title} at ${input.company}; job description needs cleanup.`;
  return truncateSummary(selected.map(capitalizeSentence).join(" "));
}

function invalidJobDescriptionText(text: string) {
  const firstChunk = text.slice(0, 900);
  const punctuationCount = (firstChunk.match(/[.!?]/g) ?? []).length;
  const questionCount = (firstChunk.match(/\?/g) ?? []).length;
  return invalidFormPattern.test(firstChunk) || (questionCount >= 3 && punctuationCount <= 2);
}

function parseSections(text: string) {
  const lines = markHeadings(text).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const sections: SummarySection[] = [];
  let currentKind: SummarySection["kind"] = "other";
  let currentText = "";

  for (const line of lines) {
    const headingKind = sectionKindForHeading(line);
    if (headingKind) {
      pushSection();
      currentKind = headingKind;
      currentText = "";
    } else {
      currentText = `${currentText} ${line}`.trim();
    }
  }
  pushSection();
  return sections.filter((section) => section.kind !== "company");

  function pushSection() {
    const textValue = cleanSectionText(currentText);
    if (textValue) sections.push({ kind: currentKind, text: textValue });
  }
}

function markHeadings(text: string) {
  return text
    .replace(/\b(ABOUT THE COMPANY|ABOUT US|WHO WE ARE|COMPANY OVERVIEW|ABOUT THE TEAM|OUR MISSION|BENEFITS|PERKS|APPLYING|EEO|EQUAL OPPORTUNITY)\b/gi, "\n$1\n")
    .replace(/\b(ABOUT THE ROLE|ABOUT THE JOB|THE ROLE|THIS ROLE|JOB DESCRIPTION|DESCRIPTION|WHAT YOU'?LL DO|WHAT YOU WILL DO|RESPONSIBILITIES|WHAT YOU'?LL WORK ON|WHAT YOU WILL WORK ON|YOU WILL|REQUIREMENTS|QUALIFICATIONS|YOU MAY BE A FIT IF|WHO YOU ARE|WHAT WE'?RE LOOKING FOR|WHAT WE ARE LOOKING FOR)\b/gi, "\n$1\n");
}

function sectionKindForHeading(line: string): SummarySection["kind"] | null {
  if (companyHeadingPattern.test(line)) return "company";
  if (roleHeadingPattern.test(line)) return "role";
  if (workHeadingPattern.test(line)) return "work";
  if (fitHeadingPattern.test(line)) return "fit";
  return null;
}

function firstSentenceFromSections(sections: SummarySection[], kind: SummarySection["kind"]) {
  return nthSentenceFromSections(sections, kind, 0);
}

function nthSentenceFromSections(sections: SummarySection[], kind: SummarySection["kind"], index: number) {
  for (const section of sections) {
    if (section.kind !== kind) continue;
    const sentence = splitSentences(section.text).filter(usefulJobSentence)[index];
    if (sentence) return sentence;
  }
  return null;
}

function firstRoleLikeSentenceAfterHeading(sections: SummarySection[]) {
  for (const section of sections) {
    if (section.kind === "other") continue;
    const sentence = splitSentences(section.text).find((item) => usefulJobSentence(item) && roleVerbPattern.test(item));
    if (sentence) return sentence;
  }
  return null;
}

function firstRoleLikeSentence(text: string) {
  return splitSentences(text).find((item) => usefulJobSentence(item) && roleVerbPattern.test(item)) ?? null;
}

function usefulJobSentence(sentence: string) {
  return sentence.length >= 28
    && !boilerplatePattern.test(sentence)
    && !applicationInstructionPattern.test(sentence)
    && !candidateTraitPattern.test(sentence)
    && !invalidFormPattern.test(sentence)
    && !companyHeadingPattern.test(sentence);
}

function normalizeJobDescription(value?: string | null) {
  return decodeSummaryEntities(value ?? "")
    .replace(/<\/(p|div|section|li|ul|ol|h[1-6])>/gi, "\n")
    .replace(/<(br|br\/)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanSectionText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function splitSentences(value: string) {
  return value.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.flatMap((sentence) => {
    const trimmed = sentence.trim();
    return trimmed ? [trimmed] : [];
  }) ?? [];
}

function truncateSummary(value: string) {
  const cleaned = value.trim();
  const normalized = `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
  if (normalized.length <= maxSummaryLength) return normalized;
  const clipped = normalized.slice(0, maxSummaryLength);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 180 ? lastSpace : maxSummaryLength).replace(/[.,;:\s]+$/, "")}...`;
}

function capitalizeSentence(value: string) {
  const cleaned = value.replace(/^[-•]\s*/, "").trim();
  return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}`;
}

function decodeSummaryEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCharCode(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
