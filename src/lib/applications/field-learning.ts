import type { AnswerMemoryReusePolicy, AnswerMemorySensitivity, ApplicationFieldMemory, ApplicationFieldMemoryStatus, AtsProvider, Prisma } from "@prisma/client";
import { upsertApplicationAnswerMemory } from "@/lib/application-answer-memory";
import { prisma } from "@/lib/prisma";

export type ObservedApplicationField = {
  fieldKey?: string | null;
  category?: string | null;
  label: string;
  inputType?: string | null;
  selector?: string | null;
  answer: string;
  source?: "manual_observation" | "assistant_confirmation";
  confidence?: number;
};

export type StoreObservedFieldLearningInput = {
  userId: string;
  applicationId: string;
  atsProvider: AtsProvider;
  host: string;
  fields: ObservedApplicationField[];
};

export type FieldLearningDecision = {
  field: ObservedApplicationField;
  action: "ignored" | "saved";
  reason?: string;
  memory?: ApplicationFieldMemory;
  reuseEligibility?: {
    activeForAutofill: boolean;
    reason: string;
  };
};

const blockedInputTypes = new Set(["hidden", "password", "file"]);
const blockedCategoryPatterns = /\b(password|captcha|recaptcha|hcaptcha|turnstile|cf-turnstile|cf_chl|verification|verify|otp|one time|one-time|security code|verification code|auth code|token|secret|ssn|social_security|payment|credit_card|file|resume|cover_letter)\b/i;
const nonApplicationControlPattern = /\b(cookie|cookies|vendor|consent|privacy preference|ot-group|onetrust|performance and functionality|advertising cookies|cookie list search|select all hosts|select all vendor|chkbox-id)\b/i;
const highSensitivityPattern = /\b(salary|compensation|pay|wage|bonus|equity|sponsor|sponsorship|visa|authorization|authorized|work permit|legal|attest|certify|convict|felony|criminal|background|clearance)\b/i;
const demographicPattern = /\b(race|ethnic|gender|sex|veteran|disab|orientation|pronoun|religion|age|birth|citizenship|nationality)\b/i;
const lowSensitivityPattern = /\b(first name|last name|full name|name|email|phone|mobile|location|city|country|linkedin|github|portfolio|website|url|source|referral|hear about|start date|availability|timezone)\b/i;
const customQuestionPattern = /\?|why|describe|explain|interesting|contribution|professional context|applying|role|experience|project|challenge|built|made major contributions/i;
const genericControlLabelPattern = /^input[-_\s]*\d+\s+(select|input|text|combobox)$/i;

export function classifyObservedField(field: ObservedApplicationField): {
  blocked: boolean;
  sensitivity: AnswerMemorySensitivity;
  reusePolicy: AnswerMemoryReusePolicy;
  status: ApplicationFieldMemoryStatus;
  category: string;
  fieldKey: string;
  confidence: number;
  reason?: string;
} {
  const label = field.label.trim();
  const answer = field.answer.trim();
  const inputType = field.inputType?.toLowerCase().trim() ?? "";
  const category = normalizeCategory(field.category, label);
  const descriptor = `${category} ${label} ${field.selector ?? ""}`;

  if (!label) return blocked("Missing field label.");
  if (!answer) return blocked("Missing observed answer.");
  if (blockedInputTypes.has(inputType)) return blocked(`Blocked input type: ${inputType}.`);
  if (nonApplicationControlPattern.test(descriptor)) return blocked("Non-application browser or cookie control.");
  if (blockedCategoryPatterns.test(descriptor)) return blocked("Blocked field category.");
  if (answer.length > 4000) return blocked("Observed answer is too long to save safely.");

  const fieldKey = canonicalFieldKey(field.fieldKey || field.selector || label);
  const confidence = clampConfidence(field.confidence ?? confidenceForField({ category, label, selector: field.selector, inputType }));
  if (demographicPattern.test(descriptor)) {
    return { blocked: false, sensitivity: "HIGH", reusePolicy: "ASK_FIRST", status: "NEEDS_REVIEW", category, fieldKey, confidence };
  }
  if (highSensitivityPattern.test(descriptor)) {
    return { blocked: false, sensitivity: "HIGH", reusePolicy: "ASK_FIRST", status: "NEEDS_REVIEW", category, fieldKey, confidence };
  }
  if (questionLikeField({ category, label, inputType })) {
    return { blocked: false, sensitivity: "MEDIUM", reusePolicy: "ASK_FIRST", status: "NEEDS_REVIEW", category, fieldKey, confidence };
  }
  if (lowSensitivityPattern.test(descriptor) || safeCategory(category)) {
    return { blocked: false, sensitivity: "LOW", reusePolicy: "AUTO_USE", status: "ACTIVE", category, fieldKey, confidence: Math.max(confidence, 86) };
  }
  return { blocked: false, sensitivity: "MEDIUM", reusePolicy: "ASK_FIRST", status: "NEEDS_REVIEW", category, fieldKey, confidence };
}

export async function storeObservedFieldLearning(input: StoreObservedFieldLearningInput) {
  const decisions: FieldLearningDecision[] = [];
  for (const field of input.fields) {
    const classification = classifyObservedField(field);
    if (classification.blocked) {
      decisions.push({ field, action: "ignored", reason: classification.reason ?? "Blocked field." });
      continue;
    }

    const answer = field.answer.trim();
    const uniqueMemoryKey = {
      userId_host_fieldKey_category: {
        userId: input.userId,
        host: input.host,
        fieldKey: classification.fieldKey,
        category: classification.category,
      },
    };
    const existingMemory = await prisma.applicationFieldMemory.findUnique({
      where: uniqueMemoryKey,
    });
    const sameAnswer = existingMemory?.answer.trim() === answer;
    const nextSuccessCount = sameAnswer ? existingMemory.successCount + 1 : 1;
    const promoted = progressiveAutoUseAllowed(classification, nextSuccessCount);
    const nextStatus = promoted ? "ACTIVE" : classification.status;
    const nextReusePolicy = promoted ? "AUTO_USE" : classification.reusePolicy;
    const nextConfidence = promoted ? Math.max(classification.confidence, 86) : classification.confidence;
    const pattern = await findRelatedFormPattern({
      userId: input.userId,
      host: input.host,
      category: classification.category,
      fieldKey: classification.fieldKey,
      selector: field.selector,
      label: field.label,
    });
    const memory = await prisma.applicationFieldMemory.upsert({
      where: uniqueMemoryKey,
      create: {
        userId: input.userId,
        sourceApplicationId: input.applicationId,
        formPatternId: pattern?.id ?? null,
        atsProvider: input.atsProvider,
        host: input.host,
        fieldKey: classification.fieldKey,
        category: classification.category,
        label: field.label.trim().slice(0, 240),
        inputType: field.inputType?.trim().slice(0, 80) || null,
        selector: field.selector?.trim().slice(0, 240) || null,
        answer,
        sensitivity: classification.sensitivity,
        reusePolicy: nextReusePolicy,
        status: nextStatus,
        confidence: nextConfidence,
        successCount: nextSuccessCount,
        metadataJson: learningMetadata(field) as Prisma.InputJsonValue,
      },
      update: {
        sourceApplicationId: input.applicationId,
        formPatternId: pattern?.id ?? undefined,
        atsProvider: input.atsProvider,
        label: field.label.trim().slice(0, 240),
        inputType: field.inputType?.trim().slice(0, 80) || null,
        selector: field.selector?.trim().slice(0, 240) || null,
        answer,
        sensitivity: classification.sensitivity,
        reusePolicy: nextReusePolicy,
        status: nextStatus,
        confidence: nextConfidence,
        successCount: nextSuccessCount,
        lastSeenAt: new Date(),
        metadataJson: learningMetadata(field) as Prisma.InputJsonValue,
      },
    });

    if (shouldMirrorToAnswerMemory(memory)) {
      await upsertApplicationAnswerMemory({
        userId: input.userId,
        questionText: memory.label,
        answer: memory.answer,
        sensitivity: memory.sensitivity,
        reusePolicy: memory.reusePolicy,
        sourceApplicationId: input.applicationId,
      }).catch(() => null);
    }

    decisions.push({ field, action: "saved", memory, reuseEligibility: reuseEligibilityForMemory(memory) });
  }
  return {
    saved: decisions.filter((decision) => decision.action === "saved").length,
    ignored: decisions.filter((decision) => decision.action === "ignored").length,
    activeForAutofill: decisions.filter((decision) => decision.reuseEligibility?.activeForAutofill).length,
    needsReview: decisions.filter((decision) => decision.action === "saved" && !decision.reuseEligibility?.activeForAutofill).length,
    decisions,
  };
}

export async function findActiveFieldMemories(input: {
  userId: string;
  atsProvider: AtsProvider;
  host: string;
  limit?: number;
}) {
  const memories = await prisma.applicationFieldMemory.findMany({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      reusePolicy: "AUTO_USE",
      sensitivity: { in: ["LOW", "MEDIUM"] },
      OR: [
        { host: input.host },
        { atsProvider: input.atsProvider },
      ],
    },
    orderBy: [{ useCount: "desc" }, { confidence: "desc" }, { updatedAt: "desc" }],
    take: Math.min(Math.max(input.limit ?? 40, 1), 100),
  });

  return memories.filter((memory) => memory.confidence >= 82);
}

export function fieldMemoryForAssistant(memory: ApplicationFieldMemory) {
  return {
    id: memory.id,
    host: memory.host,
    atsProvider: memory.atsProvider,
    fieldKey: memory.fieldKey,
    category: memory.category,
    label: memory.label,
    inputType: memory.inputType,
    selector: memory.selector,
    answer: memory.answer,
    sensitivity: memory.sensitivity,
    reusePolicy: memory.reusePolicy,
    confidence: memory.confidence,
  };
}

async function findRelatedFormPattern(input: {
  userId: string;
  host: string;
  category: string;
  fieldKey: string;
  selector?: string | null;
  label: string;
}) {
  return prisma.applicationFormPattern.findFirst({
    where: {
      userId: input.userId,
      host: input.host,
      category: input.category,
      OR: [
        { fieldKey: input.fieldKey },
        ...(input.selector ? [{ selector: input.selector }] : []),
        { label: { equals: input.label, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });
}

function shouldMirrorToAnswerMemory(memory: Pick<ApplicationFieldMemory, "category" | "label" | "answer" | "sensitivity" | "reusePolicy">) {
  if (memory.answer.length > 1200) return false;
  if (memory.sensitivity === "HIGH") return false;
  if (safeCategory(memory.category)) return false;
  if (genericControlLabelPattern.test(memory.label)) return false;
  return memory.reusePolicy === "AUTO_USE" || /\?|why|describe|explain|authorized|sponsor|source|hear about|available|start|select|question/i.test(memory.label);
}

function progressiveAutoUseAllowed(
  classification: Pick<ReturnType<typeof classifyObservedField>, "blocked" | "sensitivity" | "reusePolicy" | "status" | "confidence">,
  successCount: number,
) {
  if (classification.blocked) return false;
  if (classification.sensitivity === "HIGH") return false;
  if (classification.status === "ACTIVE" && classification.reusePolicy === "AUTO_USE") return true;
  return classification.sensitivity === "MEDIUM"
    && classification.reusePolicy === "ASK_FIRST"
    && classification.status === "NEEDS_REVIEW"
    && classification.confidence >= 82
    && successCount >= 2;
}

function questionLikeField(input: { category: string; label: string; inputType: string }) {
  if (hardSafeCategory(input.category)) return false;
  if (input.inputType === "textarea") return true;
  return input.label.length > 80 && customQuestionPattern.test(input.label);
}

function hardSafeCategory(category: string) {
  return [
    "email",
    "first_name",
    "full_name",
    "github_url",
    "last_name",
    "linkedin_url",
    "phone",
    "portfolio_url",
  ].includes(category);
}

function blocked(reason: string) {
  return {
    blocked: true as const,
    sensitivity: "HIGH" as const,
    reusePolicy: "NEVER_REUSE" as const,
    status: "DISABLED" as const,
    category: "blocked",
    fieldKey: "blocked",
    confidence: 0,
    reason,
  };
}

function reuseEligibilityForMemory(memory: Pick<ApplicationFieldMemory, "status" | "reusePolicy" | "sensitivity" | "confidence">) {
  if (memory.status !== "ACTIVE") {
    return { activeForAutofill: false, reason: "Needs review before auto-fill." };
  }
  if (memory.reusePolicy !== "AUTO_USE") {
    return { activeForAutofill: false, reason: "Reuse policy requires approval." };
  }
  if (memory.sensitivity === "HIGH") {
    return { activeForAutofill: false, reason: "High-sensitivity fields require explicit approval." };
  }
  if (memory.confidence < 82) {
    return { activeForAutofill: false, reason: "Confidence is too low for auto-fill." };
  }
  return { activeForAutofill: true, reason: "Available for future safe auto-fill." };
}

function normalizeCategory(category: string | null | undefined, label: string) {
  const raw = (category || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (raw && raw !== "unknown") return raw.slice(0, 80);
  const normalized = label.toLowerCase();
  if (/linkedin/.test(normalized)) return "linkedin_url";
  if (/github/.test(normalized)) return "github_url";
  if (/portfolio|website|homepage/.test(normalized)) return "portfolio_url";
  if (/phone|mobile|telephone/.test(normalized)) return "phone";
  if (/email|e-mail/.test(normalized)) return "email";
  if (/country/.test(normalized)) return "country";
  if (/location|city|address/.test(normalized)) return "location";
  if (/source|hear about|referral/.test(normalized)) return "referral_source";
  return "custom";
}

function safeCategory(category: string) {
  return [
    "email",
    "first_name",
    "full_name",
    "github_url",
    "last_name",
    "linkedin_url",
    "location",
    "phone",
    "portfolio_url",
    "country",
    "phone_country",
    "referral_source",
    "availability",
    "timezone",
  ].includes(category);
}

function confidenceForField(input: { category: string; label: string; selector?: string | null; inputType: string }) {
  let score = 62;
  if (safeCategory(input.category)) score += 15;
  if (input.selector) score += 8;
  if (input.label.length >= 8) score += 6;
  if (["select", "radio", "checkbox"].includes(input.inputType)) score += 4;
  return clampConfidence(score);
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function canonicalFieldKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100) || "field";
}

function learningMetadata(field: ObservedApplicationField) {
  return {
    source: field.source ?? "manual_observation",
    observedAt: new Date().toISOString(),
    stableFieldKey: field.fieldKey ? canonicalFieldKey(field.fieldKey) : null,
    humanLabel: field.label.trim().slice(0, 300),
    selector: field.selector?.trim().slice(0, 240) || null,
  };
}
