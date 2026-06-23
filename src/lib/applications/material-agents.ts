import type { GeneratedCoverLetter, GeneratedResume, Prisma } from "@prisma/client";
import { runApplicationQaAgent } from "@/lib/agents/application-qa";
import { atsResumeReviewJson, runAtsResumeReviewerAgent, type AtsResumeReviewerOutput } from "@/lib/agents/ats-resume-reviewer";
import { runResumeStrategyAgent, type ResumeStrategyOutput } from "@/lib/agents/resume-strategy";
import { prisma } from "@/lib/prisma";
import { checkAtsReadability } from "@/lib/resumes/ats";

type StrategyInput = {
  jobPostingId: string;
  jobSearchProfileId: string;
  userId?: string;
};

export async function createResumeStrategy(input: StrategyInput): Promise<ResumeStrategyOutput | null> {
  try {
    const result = await runResumeStrategyAgent(input);
    return result.output;
  } catch (error) {
    console.warn("Resume strategy agent failed.", error);
    return null;
  }
}

export async function attachResumeQa({
  resume,
  userId,
  strategy,
}: {
  resume: GeneratedResume;
  userId?: string;
  strategy?: ResumeStrategyOutput | null;
}) {
  try {
    const qa = await runApplicationQaAgent({
      jobPostingId: resume.jobPostingId,
      userId,
      resumeMarkdown: resume.markdown,
      evidenceRefs: strategy?.evidenceRefs ?? [],
    });
    return {
      qa: qa.output,
      notes: withAgentNotes(resume.generationNotes, { resumeStrategy: strategy, applicationQa: qa.output }),
    };
  } catch (error) {
    console.warn("Resume QA agent failed.", error);
    return {
      qa: null,
      notes: withAgentNotes(resume.generationNotes, { resumeStrategy: strategy, applicationQaError: error instanceof Error ? error.message : "Unknown QA error" }),
    };
  }
}

export async function attachAtsResumeReview({
  resume,
  userId,
}: {
  resume: GeneratedResume;
  userId?: string;
}): Promise<{ resume: GeneratedResume; review: AtsResumeReviewerOutput | null }> {
  try {
    const original = resume;
    let current = resume;
    const attempts: AtsResumeReviewerOutput[] = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await runAtsResumeReviewerAgent({
        jobPostingId: current.jobPostingId,
        generatedResumeId: current.id,
        userId,
      });
      const review = result.output;
      attempts.push(review);

      if (!review.rewriteDecision.applied || !review.rewrittenMarkdown || !review.rewrittenPlainText) {
        const updated = await persistAtsResumeReview(current, original, review, attempts);
        return { resume: updated, review };
      }

      current = await prisma.generatedResume.update({
        where: { id: current.id },
        data: {
          markdown: review.rewrittenMarkdown,
          plainText: review.rewrittenPlainText,
          html: `<pre>${escapeHtml(review.rewrittenPlainText)}</pre>`,
          atsChecks: checkAtsReadability(review.rewrittenPlainText) as Prisma.InputJsonValue,
          generationNotes: {
            ...jsonObject(current.generationNotes),
            atsResumeReviewInProgress: {
              attempts: attempts.map((item) => summarizeAtsReviewAttempt(item)),
            },
          } as Prisma.InputJsonValue,
        },
      });
    }

    const finalResult = await runAtsResumeReviewerAgent({
      jobPostingId: current.jobPostingId,
      generatedResumeId: current.id,
      userId,
    });
    const finalReview = finalResult.output;
    attempts.push(finalReview);
    const updated = await persistAtsResumeReview(current, original, finalReview, attempts);
    return { resume: updated, review: finalReview };
  } catch (error) {
    console.warn("ATS resume reviewer agent failed.", error);
    const updated = await prisma.generatedResume.update({
      where: { id: resume.id },
      data: {
        generationNotes: {
          ...jsonObject(resume.generationNotes),
          atsResumeReviewError: error instanceof Error ? error.message : "Unknown ATS resume review error",
        } as Prisma.InputJsonValue,
      },
    });
    return { resume: updated, review: null };
  }
}

async function persistAtsResumeReview(
  resume: GeneratedResume,
  original: GeneratedResume,
  review: AtsResumeReviewerOutput,
  attempts: AtsResumeReviewerOutput[],
) {
  const { atsResumeReviewInProgress: _inProgress, ...baseNotes } = jsonObject(resume.generationNotes);
  const reviewJson = atsResumeReviewJson(review, original);
  const rewrittenDuringReview = attempts.some((item) => item.rewriteDecision.applied);
  return prisma.generatedResume.update({
    where: { id: resume.id },
    data: {
      generationNotes: {
        ...baseNotes,
        atsResumeReview: {
          ...reviewJson,
          original: rewrittenDuringReview
            ? {
                markdown: original.markdown,
                plainText: original.plainText,
                html: original.html,
                atsChecks: original.atsChecks,
              }
            : reviewJson.original,
          attempts: attempts.map((item) => summarizeAtsReviewAttempt(item)),
        },
      } as Prisma.InputJsonValue,
    },
  });
}

function summarizeAtsReviewAttempt(review: AtsResumeReviewerOutput) {
  return {
    status: review.status,
    atsScore: review.atsScore,
    recruiterScore: review.recruiterScore,
    rewriteApplied: review.rewriteDecision.applied,
    recruiterRedFlags: review.recruiterRedFlags,
    evidenceRisks: review.evidenceRisks,
    formatWarnings: review.formatWarnings,
  };
}

export async function attachCoverLetterQa({
  coverLetter,
  resumeMarkdown,
  userId,
  strategy,
}: {
  coverLetter: GeneratedCoverLetter;
  resumeMarkdown?: string | null;
  userId?: string;
  strategy?: ResumeStrategyOutput | null;
}) {
  try {
    const qa = await runApplicationQaAgent({
      jobPostingId: coverLetter.jobPostingId,
      userId,
      resumeMarkdown,
      coverLetterBody: coverLetter.body,
      evidenceRefs: strategy?.evidenceRefs ?? [],
    });
    return {
      qa: qa.output,
      notes: withAgentNotes(coverLetter.generationNotes, { resumeStrategy: strategy, applicationQa: qa.output }),
    };
  } catch (error) {
    console.warn("Cover letter QA agent failed.", error);
    return {
      qa: null,
      notes: withAgentNotes(coverLetter.generationNotes, { resumeStrategy: strategy, applicationQaError: error instanceof Error ? error.message : "Unknown QA error" }),
    };
  }
}

export function withAgentNotes(existing: Prisma.JsonValue, updates: Record<string, unknown>) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  return {
    ...base,
    ...updates,
  } as Prisma.InputJsonValue;
}

function jsonObject(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}
