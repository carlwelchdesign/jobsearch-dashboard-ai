import { defaultResumeProfiles, resumeProfileJson } from "@/lib/resume-profiles/defaults";
import { prisma } from "@/lib/prisma";

export async function seedDefaultResumeProfiles(userId?: string) {
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");

  const results = [];
  for (const profile of defaultResumeProfiles) {
    results.push(await prisma.resumeProfile.upsert({
      where: { userId_name: { userId: user.id, name: profile.name } },
      update: {
        description: profile.description,
        targetRoles: resumeProfileJson(profile.targetRoles),
        positioningSummary: profile.positioningSummary,
        evidenceTags: resumeProfileJson(profile.evidenceTags),
        priorityProjects: resumeProfileJson(profile.priorityProjects),
        defaultSections: resumeProfileJson(profile.defaultSections),
      },
      create: {
        userId: user.id,
        name: profile.name,
        description: profile.description,
        targetRoles: resumeProfileJson(profile.targetRoles),
        positioningSummary: profile.positioningSummary,
        evidenceTags: resumeProfileJson(profile.evidenceTags),
        priorityProjects: resumeProfileJson(profile.priorityProjects),
        defaultSections: resumeProfileJson(profile.defaultSections),
      },
    }));
  }

  return results;
}
