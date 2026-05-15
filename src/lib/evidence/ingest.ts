import type { CandidateEvidenceSourceType, CandidateEvidenceType, EvidenceConfidence, Prisma } from "@prisma/client";
import { defaultUsabilityForConfidence, truthLevelToEvidenceConfidence } from "@/lib/evidence/confidence";
import { inferEvidenceTags, normalizeTags } from "@/lib/evidence/tags";
import { prisma } from "@/lib/prisma";

type EvidenceDraft = {
  candidateProfileId: string;
  type: CandidateEvidenceType;
  title: string;
  content: string;
  sourceType: CandidateEvidenceSourceType;
  sourceRef?: string | null;
  confidence: EvidenceConfidence;
  tags?: string[];
  metadata?: Prisma.InputJsonValue;
};

export async function backfillCandidateEvidence(candidateProfileId?: string) {
  const profiles = await prisma.userProfile.findMany({
    where: candidateProfileId ? { id: candidateProfileId } : undefined,
    include: {
      experienceBullets: true,
      projects: true,
      githubRepositories: true,
      resumeUploads: { where: { parsingStatus: "approved" }, orderBy: { updatedAt: "desc" } },
    },
  });

  const results = [];
  for (const profile of profiles) {
    for (const bullet of profile.experienceBullets) {
      const confidence = truthLevelToEvidenceConfidence(bullet.truthLevel);
      results.push(await upsertEvidence({
        candidateProfileId: profile.id,
        type: "ACHIEVEMENT",
        title: `${bullet.role} at ${bullet.company}`,
        content: bullet.text,
        sourceType: bullet.sourceResumeUploadId ? "RESUME_UPLOAD" : "USER_INPUT",
        sourceRef: bullet.id,
        confidence,
        tags: inferEvidenceTags(bullet.company, bullet.role, bullet.text, JSON.stringify(bullet.keywords)),
        metadata: { experienceBulletId: bullet.id, category: bullet.category, metrics: bullet.metrics } as Prisma.InputJsonValue,
      }));
    }

    for (const project of profile.projects) {
      const content = [project.description, ...(Array.isArray(project.highlights) ? project.highlights : [])].filter(Boolean).join(" ");
      results.push(await upsertEvidence({
        candidateProfileId: profile.id,
        type: "PROJECT",
        title: project.name,
        content: content || project.name,
        sourceType: project.sourceResumeUploadId ? "RESUME_UPLOAD" : "USER_INPUT",
        sourceRef: project.id,
        confidence: project.sourceResumeUploadId ? "VERIFIED" : "INFERRED",
        tags: inferEvidenceTags(project.name, project.description, JSON.stringify(project.technologies), JSON.stringify(project.highlights)),
        metadata: { projectId: project.id, url: project.url, repoUrl: project.repoUrl, technologies: project.technologies } as Prisma.InputJsonValue,
      }));
    }

    for (const repo of profile.githubRepositories) {
      results.push(await upsertEvidence({
        candidateProfileId: profile.id,
        type: "PROJECT",
        title: repo.name,
        content: [repo.description, repo.language, normalizeTags(repo.topics).join(", ")].filter(Boolean).join(" "),
        sourceType: "GITHUB_REPO",
        sourceRef: repo.id,
        confidence: "INFERRED",
        tags: inferEvidenceTags(repo.name, repo.description, repo.language, JSON.stringify(repo.topics)),
        metadata: { githubRepositoryId: repo.id, htmlUrl: repo.htmlUrl, stars: repo.stars, topics: repo.topics } as Prisma.InputJsonValue,
      }));
    }

    for (const upload of profile.resumeUploads) {
      results.push(await upsertEvidence({
        candidateProfileId: profile.id,
        type: "EXPERIENCE",
        title: `Approved resume: ${upload.fileName}`,
        content: upload.extractedText.slice(0, 4000),
        sourceType: "RESUME_UPLOAD",
        sourceRef: upload.id,
        confidence: "VERIFIED",
        tags: inferEvidenceTags(upload.extractedText),
        metadata: { resumeUploadId: upload.id, fileName: upload.fileName } as Prisma.InputJsonValue,
      }));
    }
  }

  return results;
}

export async function upsertEvidence(draft: EvidenceDraft) {
  const usable = defaultUsabilityForConfidence(draft.confidence);
  const tags = normalizeTags(draft.tags ?? []);
  const existing = await prisma.candidateEvidence.findFirst({
    where: {
      candidateProfileId: draft.candidateProfileId,
      sourceType: draft.sourceType,
      sourceRef: draft.sourceRef ?? null,
      title: draft.title,
    },
  });

  const data = {
    type: draft.type,
    title: draft.title,
    content: draft.content,
    sourceType: draft.sourceType,
    sourceRef: draft.sourceRef,
    confidence: draft.confidence,
    usableInResume: usable,
    usableInCoverLetter: usable,
    usableInRecruiterMessage: usable,
    tags: tags as Prisma.InputJsonValue,
    metadata: (draft.metadata ?? {}) as Prisma.InputJsonValue,
  };

  if (existing) {
    return prisma.candidateEvidence.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.candidateEvidence.create({
    data: {
      candidateProfileId: draft.candidateProfileId,
      ...data,
    },
  });
}
