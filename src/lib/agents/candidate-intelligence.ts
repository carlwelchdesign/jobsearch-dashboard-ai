import type { CandidateEvidenceType, EvidenceConfidence, Prisma } from "@prisma/client";
import { z } from "zod";
import { runAgent } from "@/lib/agents/run-agent";
import { inferEvidenceTags } from "@/lib/evidence/tags";
import { upsertEvidence } from "@/lib/evidence/ingest";

const candidateIntelligenceInputSchema = z.object({
  candidateProfileId: z.string(),
  userId: z.string().optional(),
  sourceType: z.enum(["RESUME_UPLOAD", "USER_INPUT", "GITHUB_REPO", "LINKEDIN", "APPLICATION_HISTORY", "INTERVIEW_NOTE", "GENERATED_BUT_APPROVED"]),
  sourceRef: z.string().optional(),
  notes: z.array(
    z.object({
      title: z.string().min(1),
      content: z.string().min(1),
    }),
  ),
});

export type CandidateIntelligenceInput = z.infer<typeof candidateIntelligenceInputSchema>;

type CandidateIntelligenceEvidenceItem = {
  id: string;
  title: string;
  type: CandidateEvidenceType;
  confidence: EvidenceConfidence;
  sourceRef: string | null;
  tags: string[];
};

export type CandidateIntelligenceOutput = {
  evidenceItems: CandidateIntelligenceEvidenceItem[];
  needsReviewItems: CandidateIntelligenceEvidenceItem[];
  suggestedProfileUpdates: string[];
  warnings: string[];
  confidence: number;
  reasoningSummary: string;
};

export async function runCandidateIntelligenceAgent(input: CandidateIntelligenceInput) {
  const parsed = candidateIntelligenceInputSchema.parse(input);

  return runAgent<CandidateIntelligenceInput, CandidateIntelligenceOutput>({
    agentType: "CANDIDATE_INTELLIGENCE",
    input: parsed,
    userId: parsed.userId,
    execute: async () => {
      const evidenceItems: CandidateIntelligenceEvidenceItem[] = [];
      const needsReviewItems: CandidateIntelligenceEvidenceItem[] = [];
      const warnings: string[] = [];

      for (const [index, note] of parsed.notes.entries()) {
        const type = classifyEvidenceType(note.title, note.content);
        const confidence = classifyConfidence(parsed.sourceType, note.content);
        const evidence = await upsertEvidence({
          candidateProfileId: parsed.candidateProfileId,
          type,
          title: note.title.trim(),
          content: note.content.trim(),
          sourceType: parsed.sourceType,
          sourceRef: parsed.sourceRef ? `${parsed.sourceRef}:${index}` : undefined,
          confidence,
          tags: inferEvidenceTags(note.title, note.content),
          metadata: { generatedBy: "candidate_intelligence_agent" } as Prisma.InputJsonValue,
        });
        const evidenceItem = {
          id: evidence.id,
          title: evidence.title,
          type: evidence.type,
          confidence: evidence.confidence,
          sourceRef: evidence.sourceRef,
          tags: Array.isArray(evidence.tags) ? evidence.tags.filter((tag): tag is string => typeof tag === "string") : [],
        };
        evidenceItems.push(evidenceItem);
        if (confidence === "NEEDS_REVIEW") {
          needsReviewItems.push(evidenceItem);
          warnings.push(`Needs review before use: ${note.title}`);
        }
      }

      return {
        evidenceItems,
        needsReviewItems,
        suggestedProfileUpdates: [],
        warnings,
        confidence: warnings.length ? 0.72 : 0.88,
        reasoningSummary: "Converted supplied notes into structured evidence using source type, claim specificity, and detected tags.",
      };
    },
  });
}

export function classifyEvidenceType(title: string, content: string): CandidateEvidenceType {
  const text = `${title} ${content}`.toLowerCase();
  if (/\bcertification|certificate\b/.test(text)) return "CERTIFICATION";
  if (/\beducation|degree|university|college\b/.test(text)) return "EDUCATION";
  if (/\bproject|repo|github|built|launched\b/.test(text)) return "PROJECT";
  if (/\bmetric|increased|reduced|improved|%|\b\d+x\b/.test(text)) return "METRIC";
  if (/\bskill|react|typescript|node|next\.?js|storybook|playwright\b/.test(text)) return "SKILL";
  if (/\bprefer|preference|remote|salary|location\b/.test(text)) return "PREFERENCE";
  return "ACHIEVEMENT";
}

export function classifyConfidence(sourceType: CandidateIntelligenceInput["sourceType"], content: string): EvidenceConfidence {
  if (sourceType === "RESUME_UPLOAD" || sourceType === "GITHUB_REPO" || sourceType === "GENERATED_BUT_APPROVED") return "VERIFIED";
  if (/\b(maybe|probably|roughly|i think|not sure|might have)\b/i.test(content)) return "NEEDS_REVIEW";
  if (sourceType === "USER_INPUT" || sourceType === "INTERVIEW_NOTE" || sourceType === "APPLICATION_HISTORY") return "INFERRED";
  return "NEEDS_REVIEW";
}
