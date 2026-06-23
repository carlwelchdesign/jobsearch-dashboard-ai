import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { runCandidateIntelligenceAgent } from "@/lib/agents/candidate-intelligence";
import { runSearchProfileManagerAgent } from "@/lib/agents/search-profile-manager";
import { prisma } from "@/lib/prisma";
import { toExperienceCategory } from "@/lib/resumes/db";
import { parseUploadedResumeSchema, type ParsedResume } from "@/lib/resumes/schemas";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const upload = await prisma.resumeUpload.findUnique({
      where: { id: params.id },
      include: { user: { include: { profile: true } } },
    });

    if (!upload) return NextResponse.json({ error: "Resume upload not found." }, { status: 404 });

    const parsed = parseUploadedResumeSchema.parse(upload.parsedJson);
    const profile = await prisma.userProfile.upsert({
      where: { userId: upload.userId },
      update: {
        fullName: parsed.contactInfo.fullName ?? upload.user.profile?.fullName ?? "Unknown",
        email: parsed.contactInfo.email ?? upload.user.email,
        phone: parsed.contactInfo.phone ?? null,
        location: parsed.contactInfo.location ?? null,
        linkedinUrl: parsed.contactInfo.linkedinUrl ?? null,
        githubUrl: parsed.contactInfo.githubUrl ?? null,
        portfolioUrl: parsed.contactInfo.portfolioUrl ?? null,
        masterSummary: parsed.professionalSummary ?? upload.user.profile?.masterSummary ?? "",
        professionalSummary: parsed.professionalSummary,
        coreSkills: parsed.skills.coreSkills as Prisma.InputJsonValue,
        technicalSkills: parsed.skills.technicalSkills as Prisma.InputJsonValue,
        domainExpertise: parsed.inferredTags as Prisma.InputJsonValue,
      },
      create: {
        userId: upload.userId,
        fullName: parsed.contactInfo.fullName ?? "Unknown",
        email: parsed.contactInfo.email ?? upload.user.email,
        phone: parsed.contactInfo.phone,
        location: parsed.contactInfo.location,
        linkedinUrl: parsed.contactInfo.linkedinUrl,
        githubUrl: parsed.contactInfo.githubUrl,
        portfolioUrl: parsed.contactInfo.portfolioUrl,
        masterSummary: parsed.professionalSummary ?? "",
        professionalSummary: parsed.professionalSummary,
        coreSkills: parsed.skills.coreSkills as Prisma.InputJsonValue,
        technicalSkills: parsed.skills.technicalSkills as Prisma.InputJsonValue,
        domainExpertise: parsed.inferredTags as Prisma.InputJsonValue,
      },
    });

    await prisma.resumeUpload.update({
      where: { id: upload.id },
      data: { userProfileId: profile.id, parsingStatus: "approved" },
    });

    await prisma.experienceBullet.deleteMany({ where: { sourceResumeUploadId: upload.id } });
    await prisma.workExperience.deleteMany({ where: { sourceResumeUploadId: upload.id } });
    await prisma.project.deleteMany({ where: { sourceResumeUploadId: upload.id } });

    const workByKey = new Map<string, string>();
    for (const work of parsed.workExperience) {
      const createdWork = await prisma.workExperience.create({
        data: {
          userProfileId: profile.id,
          sourceResumeUploadId: upload.id,
          company: work.company,
          title: work.title,
          location: work.location,
          startDate: work.startDate,
          endDate: work.endDate,
          isCurrent: work.isCurrent,
          summary: work.summary,
          skills: work.skills as Prisma.InputJsonValue,
          achievements: work.achievements as Prisma.InputJsonValue,
        },
      });
      workByKey.set(workKey(work.company, work.title), createdWork.id);
    }

    for (const bullet of parsed.experienceBullets) {
      await prisma.experienceBullet.create({
        data: {
          userProfileId: profile.id,
          sourceResumeUploadId: upload.id,
          workExperienceId: workByKey.get(workKey(bullet.company, bullet.role)),
          company: bullet.company,
          role: bullet.role,
          text: bullet.text,
          category: toExperienceCategory(bullet.category),
          metrics: bullet.metrics as Prisma.InputJsonValue,
          keywords: bullet.keywords as Prisma.InputJsonValue,
          sourceText: bullet.sourceText,
          truthLevel: "verified",
        },
      });
    }

    for (const project of parsed.projects) {
      await prisma.project.create({
        data: {
          userProfileId: profile.id,
          sourceResumeUploadId: upload.id,
          name: project.name,
          description: project.description,
          url: project.url,
          repoUrl: project.repoUrl,
          technologies: project.technologies as Prisma.InputJsonValue,
          highlights: project.highlights as Prisma.InputJsonValue,
        },
      });
    }

    const agentReview = await runResumeReonboardingReview({
      userId: upload.userId,
      profileId: profile.id,
      uploadId: upload.id,
      parsed,
    });

    return NextResponse.json({
      profileId: profile.id,
      uploadId: upload.id,
      activeResumeUploadId: upload.id,
      activationStatus: "active_latest_approved_upload",
      candidateReviewRunId: agentReview.candidateReviewRunId,
      searchProfileRunId: agentReview.searchProfileRunId,
      suggestedProfiles: agentReview.suggestedProfiles,
      agentReviewErrors: agentReview.errors,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

async function runResumeReonboardingReview({
  userId,
  profileId,
  uploadId,
  parsed,
}: {
  userId: string;
  profileId: string;
  uploadId: string;
  parsed: ParsedResume;
}) {
  const errors: string[] = [];
  let candidateReviewRunId: string | null = null;
  let searchProfileRunId: string | null = null;
  let suggestedProfiles: unknown[] = [];

  try {
    const candidateReview = await runCandidateIntelligenceAgent({
      candidateProfileId: profileId,
      userId,
      sourceType: "RESUME_UPLOAD",
      sourceRef: uploadId,
      notes: candidateNotesFromParsedResume(parsed),
    });
    candidateReviewRunId = candidateReview.run.id;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Candidate intelligence review failed.");
  }

  try {
    const searchProfileReview = await runSearchProfileManagerAgent({
      userId,
      mode: "resume_reonboarding",
      resumeUploadId: uploadId,
      candidateProfileId: profileId,
    });
    searchProfileRunId = searchProfileReview.run.id;
    suggestedProfiles = searchProfileReview.output.suggestedProfiles ?? [];
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Search profile review failed.");
  }

  return {
    candidateReviewRunId,
    searchProfileRunId,
    suggestedProfiles,
    errors,
  };
}

function candidateNotesFromParsedResume(parsed: ParsedResume) {
  const notes = [
    parsed.professionalSummary ? { title: "Professional summary", content: parsed.professionalSummary } : null,
    parsed.skills.technicalSkills.length ? { title: "Technical skills", content: parsed.skills.technicalSkills.join(", ") } : null,
    ...parsed.workExperience.slice(0, 30).map((work) => ({
      title: `${work.company} - ${work.title}`,
      content: [
        work.summary,
        work.skills.length ? `Skills: ${work.skills.join(", ")}` : null,
        ...work.achievements.slice(0, 8),
      ].filter(Boolean).join("\n"),
    })),
    ...parsed.projects.slice(0, 12).map((project) => ({
      title: `Project: ${project.name}`,
      content: [
        project.description,
        project.technologies.length ? `Technologies: ${project.technologies.join(", ")}` : null,
        ...project.highlights.slice(0, 6),
      ].filter(Boolean).join("\n"),
    })),
  ].filter((note): note is { title: string; content: string } => Boolean(note?.content.trim()));

  return notes.length ? notes : [{ title: "Resume upload", content: "Resume approved for profile re-onboarding." }];
}

function workKey(company: string, role: string) {
  return `${normalize(company)}::${normalize(role)}`;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
