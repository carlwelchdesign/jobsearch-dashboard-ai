import type { ExperienceBullet, GithubRepository, JobPosting, Project, UserProfile, WorkExperience } from "@prisma/client";
import { generateCoverLetterForJob } from "@/lib/ai/resume";
import { runApplicationEvidenceCuratorAgent } from "@/lib/agents/application-evidence-curator";
import { runHiringManagerReviewerAgent } from "@/lib/agents/hiring-manager-reviewer";
import {
  buildApplicationMaterialQuality,
  type ApplicationEvidencePlan,
  type ApplicationMaterialQuality,
  type HiringManagerMaterialReview,
} from "@/lib/applications/material-quality";
import type { ResumeStrategyOutput } from "@/lib/agents/resume-strategy";

export type ReviewedCoverLetterDraft = {
  body: string;
  generatedBy: string;
  toneNotes: string[];
  warnings: string[];
  unsupportedClaimsDetected: string[];
  evidencePlan: ApplicationEvidencePlan | null;
  hiringManagerReview: HiringManagerMaterialReview | null;
  materialQuality: ApplicationMaterialQuality;
  rewriteAttempted: boolean;
};

export async function generateReviewedCoverLetterForJob({
  userId,
  userProfile,
  job,
  jobSearchProfileId,
  bullets,
  projects,
  workExperiences,
  githubRepositories,
  tailoredResumeMarkdown,
  writingGuidance,
  strategy,
}: {
  userId: string;
  userProfile: UserProfile;
  job: JobPosting;
  jobSearchProfileId?: string | null;
  bullets: ExperienceBullet[];
  projects: Project[];
  workExperiences: WorkExperience[];
  githubRepositories: GithubRepository[];
  tailoredResumeMarkdown?: string | null;
  writingGuidance: string[];
  strategy?: ResumeStrategyOutput | null;
}): Promise<ReviewedCoverLetterDraft> {
  const evidencePlan = await runApplicationEvidenceCuratorAgent({
    jobPostingId: job.id,
    jobSearchProfileId,
    userId,
    candidateProfileId: userProfile.id,
    bullets,
    projects,
    workExperiences,
    githubRepositories,
    tailoredResumeMarkdown,
  }).then((result) => result.output).catch((error) => {
    console.warn("Application evidence curator failed.", error);
    return null;
  });

  const firstDraft = await generateCoverLetterForJob({
    userProfile,
    job,
    bullets,
    projects,
    workExperiences,
    githubRepositories,
    tailoredResumeMarkdown,
    writingGuidance,
    evidencePlan,
  });
  let draft = firstDraft;
  let review = await reviewDraft({ job, userId, draft, evidencePlan });
  let rewriteAttempted = false;

  if (review?.rewriteRecommended && draft.generatedBy !== "deterministic_fallback") {
    rewriteAttempted = true;
    const rewritten = await generateCoverLetterForJob({
      userProfile,
      job,
      bullets,
      projects,
      workExperiences,
      githubRepositories,
      tailoredResumeMarkdown,
      writingGuidance,
      evidencePlan,
      rewriteInstructions: review.rewriteInstructions,
    });
    const rewriteReview = await reviewDraft({ job, userId, draft: rewritten, evidencePlan });
    if ((rewriteReview?.score ?? 0) >= (review.score ?? 0)) {
      draft = rewritten;
      review = rewriteReview;
    }
  }

  const materialQuality = buildApplicationMaterialQuality({
    body: draft.body,
    generatedBy: draft.generatedBy,
    evidencePlan,
    hiringManagerReview: review,
    rewriteAttempted,
  });

  return {
    body: draft.body,
    generatedBy: draft.generatedBy,
    toneNotes: draft.toneNotes,
    warnings: draft.warnings,
    unsupportedClaimsDetected: draft.unsupportedClaimsDetected,
    evidencePlan,
    hiringManagerReview: review,
    materialQuality,
    rewriteAttempted,
  };
}

async function reviewDraft({
  job,
  userId,
  draft,
  evidencePlan,
}: {
  job: JobPosting;
  userId: string;
  draft: { body: string; generatedBy?: string | null };
  evidencePlan: ApplicationEvidencePlan | null;
}) {
  return runHiringManagerReviewerAgent({
    jobPostingId: job.id,
    userId,
    coverLetterBody: draft.body,
    generatedBy: draft.generatedBy,
    evidencePlan,
  }).then((result) => result.output).catch((error) => {
    console.warn("Hiring-manager review failed.", error);
    return null;
  });
}
