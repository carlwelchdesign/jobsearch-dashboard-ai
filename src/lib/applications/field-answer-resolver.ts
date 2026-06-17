import type { AnswerMemorySensitivity, AtsProvider } from "@prisma/client";
import { answerApplicationQuestion } from "@/lib/ai/application-question";
import { findReusableAnswerMemories } from "@/lib/application-answer-memory";
import { selectedApplicationAnswers } from "@/lib/applications/application-packets";
import { findActiveFieldMemories } from "@/lib/applications/field-learning";
import { prisma } from "@/lib/prisma";

export type ApplicationFieldAnswerRequest = {
  applicationId: string;
  field: {
    fieldId?: string | null;
    label: string;
    inputType?: string | null;
    category?: string | null;
    selector?: string | null;
    context?: string | null;
  };
  minimumConfidence?: number;
};

export type ApplicationFieldAnswerResolution = {
  answer: string | null;
  confidence: number;
  sensitivity: AnswerMemorySensitivity;
  source: "profile" | "field_memory" | "answer_memory" | "selected_answer" | "generated" | "blocked" | "none";
  autoFillAllowed: boolean;
  reason: string;
  generatedBy?: string | null;
  memoryMatchId?: string | null;
};

const defaultMinimumConfidence = 82;
const blockedPattern = /\b(password|captcha|recaptcha|hcaptcha|turnstile|cf-turnstile|cf_chl|verification|verify|otp|one time|one-time|security code|verification code|auth code|token|secret|ssn|social security|payment|credit card|resume|cover letter|cookie|cookies|vendor|consent|privacy preference|ot-group|onetrust)\b/i;
const sensitivePattern = /\b(salary|compensation|pay|wage|bonus|equity|sponsor|sponsorship|visa|authorization|authorized|work permit|legal|attest|certify|convict|felony|criminal|background|clearance|race|ethnic|gender|sex|veteran|disab|orientation|pronoun|religion|age|birth|citizenship|nationality)\b/i;

export async function resolveApplicationFieldAnswer(input: ApplicationFieldAnswerRequest): Promise<ApplicationFieldAnswerResolution> {
  const label = input.field.label.trim();
  const descriptor = fieldDescriptor(input.field);
  const minimumConfidence = input.minimumConfidence ?? defaultMinimumConfidence;
  if (!label) return none("Field label is missing.");
  if (blockedPattern.test(descriptor)) return blocked("Blocked field type or browser control.");

  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: {
      applicationPackets: { orderBy: { updatedAt: "desc" }, take: 1 },
      coverLetter: true,
      jobPosting: true,
      user: { include: { profile: true } },
    },
  });
  if (!application) throw new Error("Application not found.");

  const explicitProfile = explicitProfileAnswer(descriptor, application.user.profile);
  if (explicitProfile) {
    return {
      answer: explicitProfile.answer,
      confidence: 96,
      sensitivity: explicitProfile.sensitivity,
      source: "profile",
      autoFillAllowed: true,
      reason: explicitProfile.reason,
    };
  }

  if (sensitivePattern.test(descriptor)) {
    return {
      answer: null,
      confidence: 0,
      sensitivity: "HIGH",
      source: "blocked",
      autoFillAllowed: false,
      reason: "Sensitive field requires explicit profile data or user approval.",
    };
  }

  const memory = await bestFieldMemory({
    userId: application.userId,
    atsProvider: application.jobPosting.atsProvider,
    host: hostFromUrl(application.jobPosting.applicationUrl),
    descriptor,
    selector: input.field.selector,
  });
  if (memory) {
    return {
      answer: memory.answer,
      confidence: memory.confidence,
      sensitivity: memory.sensitivity,
      source: "field_memory",
      autoFillAllowed: memory.confidence >= minimumConfidence,
      reason: `Matched approved field memory: ${memory.label}`,
      memoryMatchId: memory.id,
    };
  }

  const answerMemories = await findReusableAnswerMemories(application.userId, label, 3);
  const autoMemory = answerMemories.find((candidate) => candidate.autoUsable);
  if (autoMemory) {
    return {
      answer: autoMemory.answer,
      confidence: autoMemory.matchScore,
      sensitivity: autoMemory.sensitivity,
      source: "answer_memory",
      autoFillAllowed: autoMemory.matchScore >= minimumConfidence,
      reason: `Matched approved answer memory (${autoMemory.matchScore}%).`,
      memoryMatchId: autoMemory.id,
    };
  }

  const selectedAnswer = selectedApplicationAnswer(descriptor, selectedApplicationAnswers(application.applicationPackets[0]?.applicationAnswersJson));
  if (selectedAnswer) {
    return {
      answer: selectedAnswer,
      confidence: 90,
      sensitivity: "MEDIUM",
      source: "selected_answer",
      autoFillAllowed: true,
      reason: "Matched selected application packet answer.",
    };
  }

  if (!questionLike(label, input.field.inputType)) return none("Field is not question-like enough to generate an answer.");

  const profile = await prisma.userProfile.findFirst({
    where: { userId: application.userId },
    include: {
      experienceBullets: { where: { truthLevel: "verified" }, orderBy: { createdAt: "desc" }, take: 120 },
      workExperiences: { orderBy: { createdAt: "desc" }, take: 80 },
      projects: { orderBy: { createdAt: "desc" }, take: 40 },
      githubRepositories: { orderBy: [{ pushedAt: "desc" }, { stars: "desc" }], take: 50 },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!profile) return none("No approved candidate profile exists for generated field answer.");

  const generated = await answerApplicationQuestion({
    question: label,
    userProfile: profile,
    bullets: profile.experienceBullets,
    workExperiences: profile.workExperiences,
    projects: profile.projects,
    githubRepositories: profile.githubRepositories,
    answerMemory: answerMemories,
  });
  const answer = generated.options[0]?.answer?.trim() ?? "";
  if (!answer) return none("Generated answer was empty.");
  const confidence = generated.generatedBy === "openai_structured_outputs" ? 88 : 84;
  return {
    answer,
    confidence,
    sensitivity: "MEDIUM",
    source: "generated",
    autoFillAllowed: confidence >= minimumConfidence,
    reason: "Generated from application context.",
    generatedBy: generated.generatedBy,
  };
}

async function bestFieldMemory(input: {
  userId: string;
  atsProvider: AtsProvider;
  host: string;
  descriptor: string;
  selector?: string | null;
}) {
  const memories = await findActiveFieldMemories({
    userId: input.userId,
    atsProvider: input.atsProvider,
    host: input.host,
    limit: 60,
  });
  const selector = input.selector?.trim();
  for (const memory of memories) {
    if (selector && memory.selector === selector) return memory;
    const overlap = tokenOverlap(memory.label, input.descriptor);
    if (overlap >= 0.65) return memory;
    if (memory.category && normalize(input.descriptor).includes(normalize(memory.category))) return memory;
  }
  return null;
}

function explicitProfileAnswer(descriptor: string, profile: { raceAnswer?: string | null; genderAnswer?: string | null; veteranStatusAnswer?: string | null; disabilityAnswer?: string | null } | null) {
  if (!profile) return null;
  if (/\b(veteran|protected veteran|military service|armed forces)\b/i.test(descriptor) && profile.veteranStatusAnswer) {
    return { answer: profile.veteranStatusAnswer, sensitivity: "HIGH" as const, reason: "Resolved from explicit profile veteran status setting." };
  }
  if (/\b(race|ethnic)\b/i.test(descriptor) && profile.raceAnswer) {
    return { answer: profile.raceAnswer, sensitivity: "HIGH" as const, reason: "Resolved from explicit profile race/ethnicity setting." };
  }
  if (/\b(gender|sex)\b/i.test(descriptor) && profile.genderAnswer) {
    return { answer: profile.genderAnswer, sensitivity: "HIGH" as const, reason: "Resolved from explicit profile gender setting." };
  }
  if (/\b(disab|ability status)\b/i.test(descriptor) && profile.disabilityAnswer) {
    return { answer: profile.disabilityAnswer, sensitivity: "HIGH" as const, reason: "Resolved from explicit profile disability setting." };
  }
  return null;
}

function selectedApplicationAnswer(descriptor: string, answers: Array<{ question?: string; answer?: string }>) {
  for (const item of answers) {
    const question = item.question ?? "";
    const answer = item.answer?.trim() ?? "";
    if (!question || !answer) continue;
    const tokens = normalize(question).split(/\s+/).filter((token) => token.length > 3);
    const overlap = tokens.filter((token) => normalize(descriptor).includes(token)).length;
    if (overlap >= Math.min(3, tokens.length)) return answer;
  }
  return null;
}

function fieldDescriptor(field: ApplicationFieldAnswerRequest["field"]) {
  return [field.category, field.label, field.inputType, field.selector, field.context].filter(Boolean).join(" ").toLowerCase();
}

function questionLike(label: string, inputType?: string | null) {
  return inputType === "textarea" || /\?|why|describe|explain|tell us|interest|experience|project|challenge|contribution|about you|anything else/i.test(label);
}

function blocked(reason: string): ApplicationFieldAnswerResolution {
  return { answer: null, confidence: 0, sensitivity: "HIGH", source: "blocked", autoFillAllowed: false, reason };
}

function none(reason: string): ApplicationFieldAnswerResolution {
  return { answer: null, confidence: 0, sensitivity: "LOW", source: "none", autoFillAllowed: false, reason };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = new Set(normalize(left).split(/\s+/).filter((token) => token.length > 2));
  const rightTokens = new Set(normalize(right).split(/\s+/).filter((token) => token.length > 2));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / leftTokens.size;
}

function hostFromUrl(url: string | null) {
  if (!url) return "unknown";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
