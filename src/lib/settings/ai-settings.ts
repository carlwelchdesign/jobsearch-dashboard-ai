import { prisma } from "@/lib/prisma";

export const DEFAULT_LINKEDIN_CONTENT_MODEL = "gpt-5.5";

export function normalizeLinkedInContentModel(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 100)
    : DEFAULT_LINKEDIN_CONTENT_MODEL;
}

export async function getAiSettings(userId: string) {
  return prisma.aiSettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      linkedinContentModel: DEFAULT_LINKEDIN_CONTENT_MODEL,
    },
  });
}

export async function updateAiSettings(input: { userId: string; linkedinContentModel: string }) {
  return prisma.aiSettings.upsert({
    where: { userId: input.userId },
    update: {
      linkedinContentModel: normalizeLinkedInContentModel(input.linkedinContentModel),
    },
    create: {
      userId: input.userId,
      linkedinContentModel: normalizeLinkedInContentModel(input.linkedinContentModel),
    },
  });
}

export async function getLinkedInContentModel(userId: string) {
  const settings = await getAiSettings(userId);
  return normalizeLinkedInContentModel(settings.linkedinContentModel);
}
