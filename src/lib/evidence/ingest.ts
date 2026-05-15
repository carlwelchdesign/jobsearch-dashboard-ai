import type { CandidateEvidenceSourceType, CandidateEvidenceType, EvidenceConfidence, GithubRepository, Prisma } from "@prisma/client";
import { syncEvidenceChunks } from "@/lib/evidence/chunking";
import { defaultUsabilityForConfidence, truthLevelToEvidenceConfidence } from "@/lib/evidence/confidence";
import { inferEvidenceTags, normalizeTags } from "@/lib/evidence/tags";
import { prisma } from "@/lib/prisma";

export type EvidenceDraft = {
  candidateProfileId: string;
  type: CandidateEvidenceType;
  title: string;
  content: string;
  sourceType: CandidateEvidenceSourceType;
  sourceRef?: string | null;
  confidence: EvidenceConfidence;
  usableInResume?: boolean;
  usableInCoverLetter?: boolean;
  usableInRecruiterMessage?: boolean;
  tags?: string[];
  metadata?: Prisma.InputJsonValue;
};

type GithubRepositoryEvidenceSource = Pick<GithubRepository, "id" | "name" | "description" | "htmlUrl" | "homepage" | "language" | "topics" | "stars" | "forks" | "isFork" | "isArchived" | "pushedAt">;

export const jobSearchOsProject = {
  name: "Job Search OS",
  description:
    "Local-first AI-powered job search operating system coordinating specialized agents for evidence ingestion, job scoring, search strategy, resume and cover letter generation, application packet QA, recruiter outreach, outcome learning, and Dockerized RAG retrieval.",
  repoUrl: null,
  url: null,
  technologies: [
    "Next.js",
    "TypeScript",
    "React",
    "Prisma",
    "PostgreSQL",
    "pgvector",
    "Redis",
    "Docker",
    "OpenAI structured outputs",
    "Material UI",
    "Vitest",
  ],
  highlights: [
    "Built a typed agent service layer with persisted AgentRun observability and deterministic fallbacks.",
    "Implemented candidate evidence ingestion, chunking, embeddings, pgvector retrieval, and confidence-based filtering for truthful generated materials.",
    "Created explainable fit, opportunity, and confidence scoring for jobs, plus outcome learning and search profile optimization.",
    "Built application packet generation with resume strategy, cover letter drafts, recruiter messages, QA checks, selected answer export, and local browser assistant support.",
    "Dockerized the app with Postgres, pgvector, Redis, and an embeddings worker, with tests and page smoke verification.",
  ],
  tags: [
    "ai-product",
    "ai-agents",
    "internal-tools",
    "workflow-automation",
    "rag",
    "pgvector",
    "postgres",
    "redis",
    "docker",
    "nextjs",
    "typescript",
    "prisma",
    "application-automation",
    "job-search-os",
    "developer-tools",
  ],
} as const;

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
    results.push(await syncJobSearchOsProjectEvidence(profile.id));

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
      if (project.name === jobSearchOsProject.name) continue;
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
      results.push(await upsertEvidence(buildGithubRepositoryEvidenceDraft(profile.id, repo)));
    }

    for (const upload of profile.resumeUploads) {
      const resumeChunks = createResumeEvidenceChunks(upload.extractedText, upload.fileName);
      for (const chunk of resumeChunks) {
        results.push(await upsertEvidence({
          candidateProfileId: profile.id,
          type: chunk.type,
          title: chunk.title,
          content: chunk.content,
          sourceType: "RESUME_UPLOAD",
          sourceRef: `${upload.id}:chunk:${chunk.index}`,
          confidence: "VERIFIED",
          tags: inferEvidenceTags(chunk.title, chunk.content),
          metadata: {
            resumeUploadId: upload.id,
            fileName: upload.fileName,
            chunkIndex: chunk.index,
            chunkedResumeEvidence: true,
          } as Prisma.InputJsonValue,
        }));
      }
    }
  }

  return results;
}

export async function syncJobSearchOsProjectEvidence(candidateProfileId: string) {
  const existingProject = await prisma.project.findFirst({
    where: {
      userProfileId: candidateProfileId,
      name: jobSearchOsProject.name,
    },
  });

  const projectData = {
    description: jobSearchOsProject.description,
    url: jobSearchOsProject.url,
    repoUrl: jobSearchOsProject.repoUrl,
    technologies: [...jobSearchOsProject.technologies] as Prisma.InputJsonValue,
    highlights: [...jobSearchOsProject.highlights] as Prisma.InputJsonValue,
  };

  const project = existingProject
    ? await prisma.project.update({
        where: { id: existingProject.id },
        data: projectData,
      })
    : await prisma.project.create({
        data: {
          userProfileId: candidateProfileId,
          name: jobSearchOsProject.name,
          ...projectData,
        },
      });

  return upsertEvidence(buildJobSearchOsProjectEvidenceDraft(candidateProfileId, project.id));
}

export function buildJobSearchOsProjectEvidenceDraft(candidateProfileId: string, projectId: string): EvidenceDraft {
  const content = [
    jobSearchOsProject.description,
    `Technologies: ${jobSearchOsProject.technologies.join(", ")}.`,
    ...jobSearchOsProject.highlights,
  ].join(" ");

  return {
    candidateProfileId,
    type: "PROJECT",
    title: jobSearchOsProject.name,
    content,
    sourceType: "USER_INPUT",
    sourceRef: projectId,
    confidence: "VERIFIED",
    usableInResume: true,
    usableInCoverLetter: true,
    usableInRecruiterMessage: true,
    tags: [...jobSearchOsProject.tags, ...inferEvidenceTags(jobSearchOsProject.name, content)],
    metadata: {
      projectId,
      generatedBy: "job_search_os_seed",
      preferredWorkSignal: true,
      userPreference:
        "The user wants agents to consider this app as experience and prefers roles building agentic workflow tools, internal automation, AI product infrastructure, RAG/evidence systems, and hands-off operational software.",
      technologies: jobSearchOsProject.technologies,
      highlights: jobSearchOsProject.highlights,
    } as Prisma.InputJsonValue,
  };
}

export async function syncGithubRepositoryEvidence(userProfileId: string, repositories?: GithubRepositoryEvidenceSource[]) {
  const repos = repositories ?? await prisma.githubRepository.findMany({
    where: { userProfileId, isArchived: false },
    orderBy: [{ isFork: "asc" }, { pushedAt: "desc" }, { stars: "desc" }],
    take: 80,
  });
  const results = [];

  for (const repo of repos.filter((item) => !item.isArchived)) {
    results.push(await upsertEvidence(buildGithubRepositoryEvidenceDraft(userProfileId, repo)));
  }

  return results;
}

export async function syncApprovedApplicationPacketEvidence(applicationId: string) {
  const packet = await prisma.applicationPacket.findUnique({
    where: { applicationId },
    include: {
      application: true,
      jobPosting: true,
      user: { include: { profile: true } },
    },
  });

  if (!packet?.user.profile) return null;
  if (packet.status !== "APPROVED" && packet.status !== "SUBMITTED") return null;

  return upsertEvidence(buildApprovedApplicationPacketEvidenceDraft(packet.user.profile.id, {
    id: packet.id,
    applicationId: packet.applicationId,
    jobPostingId: packet.jobPostingId,
    company: packet.jobPosting.company,
    title: packet.jobPosting.title,
    tailoredResumeContent: packet.tailoredResumeContent,
    coverLetterContent: packet.coverLetterContent,
    recruiterMessage: packet.recruiterMessage,
    hiringManagerMessage: packet.hiringManagerMessage,
    evidenceRefs: packet.evidenceRefs,
    status: packet.status,
  }));
}

export function buildApprovedApplicationPacketEvidenceDraft(
  userProfileId: string,
  packet: {
    id: string;
    applicationId: string;
    jobPostingId: string;
    company: string;
    title: string;
    tailoredResumeContent?: string | null;
    coverLetterContent?: string | null;
    recruiterMessage?: string | null;
    hiringManagerMessage?: string | null;
    evidenceRefs?: unknown;
    status: "APPROVED" | "SUBMITTED";
  },
): EvidenceDraft {
  const content = [
    `Approved application material for ${packet.company} - ${packet.title}.`,
    packet.coverLetterContent ? `Cover letter style sample: ${boundedText(packet.coverLetterContent, 900)}` : null,
    packet.recruiterMessage ? `Recruiter message style sample: ${boundedText(packet.recruiterMessage, 500)}` : null,
    packet.hiringManagerMessage ? `Hiring manager message style sample: ${boundedText(packet.hiringManagerMessage, 500)}` : null,
    packet.tailoredResumeContent ? `Resume positioning sample: ${boundedText(packet.tailoredResumeContent, 900)}` : null,
  ].filter(Boolean).join("\n\n");

  return {
    candidateProfileId: userProfileId,
    type: "WRITING_STYLE",
    title: `Approved application packet: ${packet.company} - ${packet.title}`,
    content,
    sourceType: "GENERATED_BUT_APPROVED",
    sourceRef: packet.id,
    confidence: "INFERRED",
    usableInResume: false,
    usableInCoverLetter: true,
    usableInRecruiterMessage: true,
    tags: inferEvidenceTags(packet.company, packet.title, content),
    metadata: {
      applicationPacketId: packet.id,
      applicationId: packet.applicationId,
      jobPostingId: packet.jobPostingId,
      generatedMaterialStyleReference: true,
      sourcePacketStatus: packet.status,
      evidenceRefs: jsonStringArray(packet.evidenceRefs),
    } as Prisma.InputJsonValue,
  };
}

export function buildGithubRepositoryEvidenceDraft(userProfileId: string, repo: GithubRepositoryEvidenceSource): EvidenceDraft {
  const topics = normalizeTags(repo.topics);
  const content = [
    repo.description,
    repo.language ? `Primary language: ${repo.language}` : null,
    topics.length ? `Topics: ${topics.join(", ")}` : null,
    repo.homepage ? `Homepage: ${repo.homepage}` : null,
    `Repository: ${repo.htmlUrl}`,
  ].filter(Boolean).join(" ");

  return {
    candidateProfileId: userProfileId,
    type: "PROJECT",
    title: repo.name,
    content: content || repo.name,
    sourceType: "GITHUB_REPO",
    sourceRef: repo.id,
    confidence: "INFERRED",
    tags: inferEvidenceTags(repo.name, repo.description, repo.language, JSON.stringify(repo.topics), repo.htmlUrl),
    metadata: {
      githubRepositoryId: repo.id,
      htmlUrl: repo.htmlUrl,
      homepage: repo.homepage,
      stars: repo.stars,
      forks: repo.forks,
      isFork: repo.isFork,
      pushedAt: repo.pushedAt?.toISOString() ?? null,
      topics: repo.topics,
    } as Prisma.InputJsonValue,
  };
}

export function createResumeEvidenceChunks(extractedText: string, fileName: string) {
  const normalized = extractedText
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } = { heading: "Resume summary", lines: [] };

  for (const line of lines) {
    if (isResumeSectionHeading(line) && current.lines.length) {
      sections.push(current);
      current = { heading: line, lines: [] };
    } else if (isResumeSectionHeading(line)) {
      current.heading = line;
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length) sections.push(current);

  const chunks: Array<{ index: number; type: CandidateEvidenceType; title: string; content: string }> = [];
  for (const section of sections) {
    const sectionText = section.lines.join(" ");
    const pieces = splitResumeSection(sectionText);
    for (const piece of pieces) {
      chunks.push({
        index: chunks.length,
        type: sectionType(section.heading),
        title: `Resume evidence: ${section.heading} (${fileName})`,
        content: piece,
      });
    }
  }

  return chunks.slice(0, 32);
}

function isResumeSectionHeading(line: string) {
  const normalized = line.trim();
  if (normalized.length < 3 || normalized.length > 48) return false;
  return /^(summary|profile|experience|work experience|professional experience|projects|selected projects|skills|technical skills|education|certifications|achievements)$/i.test(normalized)
    || (/^[A-Z][A-Z\s/&-]+$/.test(normalized) && normalized.split(/\s+/).length <= 4);
}

function splitResumeSection(text: string) {
  const maxLength = 1100;
  const sentences = text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  if (!sentences.length) return text.length > maxLength ? [text.slice(0, maxLength)] : [text];

  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length && `${current} ${sentence}`.length > maxLength) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces.map((piece) => piece.slice(0, maxLength));
}

function sectionType(heading: string): CandidateEvidenceType {
  if (/project/i.test(heading)) return "PROJECT";
  if (/skill/i.test(heading)) return "SKILL";
  if (/education/i.test(heading)) return "EDUCATION";
  if (/certification/i.test(heading)) return "CERTIFICATION";
  if (/achievement/i.test(heading)) return "ACHIEVEMENT";
  return "EXPERIENCE";
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
    usableInResume: draft.usableInResume ?? usable,
    usableInCoverLetter: draft.usableInCoverLetter ?? usable,
    usableInRecruiterMessage: draft.usableInRecruiterMessage ?? usable,
    tags: tags as Prisma.InputJsonValue,
    metadata: (draft.metadata ?? {}) as Prisma.InputJsonValue,
  };

  if (existing) {
    const evidence = await prisma.candidateEvidence.update({
      where: { id: existing.id },
      data,
    });
    await syncEvidenceChunks(evidence);
    return evidence;
  }

  const evidence = await prisma.candidateEvidence.create({
    data: {
      candidateProfileId: draft.candidateProfileId,
      ...data,
    },
  });
  await syncEvidenceChunks(evidence);
  return evidence;
}

function boundedText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
}

function jsonStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
