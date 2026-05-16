import { Prisma } from "@prisma/client";
import { suggestSearchProfiles } from "@/lib/ai/profile-suggestions";
import { prisma } from "@/lib/prisma";

export async function rebuildSearchProfilesFromRecruitingBoard() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");

  const profile = await prisma.userProfile.findFirst({
    include: {
      experienceBullets: { where: { truthLevel: "verified" }, take: 160 },
      workExperiences: { take: 100 },
      projects: { take: 60 },
      githubRepositories: { orderBy: [{ pushedAt: "desc" }, { stars: "desc" }], take: 80 },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!profile) {
    throw new Error("No approved candidate profile exists. Upload and approve a resume first.");
  }

  const applicationHistory = await prisma.application.findMany({
    where: { userId: user.id },
    include: {
      jobPosting: { select: { company: true, title: true } },
      jobProfileMatch: { select: { overallScore: true } },
      outcomes: { select: { outcome: true }, orderBy: { occurredAt: "desc" }, take: 3 },
      emailMessages: { where: { classification: "AUTOMATED_CONFIRMATION" }, select: { id: true }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const suggestions = await suggestSearchProfiles({
    userProfile: profile,
    bullets: profile.experienceBullets,
    workExperiences: profile.workExperiences,
    projects: profile.projects,
    githubRepositories: profile.githubRepositories,
    applicationHistory: applicationHistory.map((application) => ({
      company: application.jobPosting.company,
      title: application.jobPosting.title,
      status: application.status,
      outcomes: application.outcomes.map((outcome) => outcome.outcome),
      matchScore: application.jobProfileMatch?.overallScore ?? null,
      receivedConfirmation: application.emailMessages.length > 0,
    })),
  });

  const existingCount = await prisma.jobSearchProfile.count({ where: { userId: user.id } });
  const created = await prisma.$transaction(async (tx) => {
    await tx.jobSearchProfile.deleteMany({ where: { userId: user.id } });

    const createdProfiles = [];
    for (const suggestion of suggestions) {
      createdProfiles.push(await tx.jobSearchProfile.create({
        data: {
          userId: user.id,
          name: suggestion.name,
          enabled: true,
          searchIntent: suggestion.searchIntent,
          remotePreference: suggestion.remotePreference,
          relocationPreference: suggestion.relocationPreference,
          salaryCurrency: suggestion.salaryCurrency,
          salaryMin: suggestion.salaryMin,
          salaryMax: null,
          includeUnknownSalary: true,
          minimumMatchScore: suggestion.minimumMatchScore,
          maxResultsPerRun: 50,
          titles: suggestion.titles as Prisma.InputJsonValue,
          jobTypes: suggestion.jobTypes as Prisma.InputJsonValue,
          countries: suggestion.countries as Prisma.InputJsonValue,
          industries: suggestion.industries as Prisma.InputJsonValue,
          keywordsRequired: suggestion.keywordsRequired as Prisma.InputJsonValue,
          keywordsPreferred: suggestion.keywordsPreferred as Prisma.InputJsonValue,
          keywordsExcluded: suggestion.keywordsExcluded as Prisma.InputJsonValue,
          excludedCompanies: suggestion.excludedCompanies as Prisma.InputJsonValue,
        },
      }));
    }

    return createdProfiles;
  });

  return {
    deletedProfiles: existingCount,
    createdProfiles: created.length,
    generatedBy: process.env.OPENAI_API_KEY ? "openai_structured_outputs" : "deterministic_fallback",
    verifiedBulletsConsidered: profile.experienceBullets.length,
    githubRepositoriesConsidered: profile.githubRepositories.length,
    applicationsConsidered: applicationHistory.length,
    profiles: created.map((createdProfile, index) => ({
      id: createdProfile.id,
      name: createdProfile.name,
      rationale: suggestions[index]?.rationale ?? null,
      titles: suggestions[index]?.titles ?? [],
      keywordsPreferred: suggestions[index]?.keywordsPreferred ?? [],
      minimumMatchScore: createdProfile.minimumMatchScore,
    })),
  };
}
