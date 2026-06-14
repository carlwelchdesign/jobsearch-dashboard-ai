import { prisma } from "@/lib/prisma";

export const DEFAULT_LINKEDIN_CONTENT_MODEL = "gpt-5.5";
export const DEFAULT_LINKEDIN_DIAGRAM_IMAGE_MODEL = "gpt-image-2";

export function normalizeLinkedInContentModel(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 100)
    : DEFAULT_LINKEDIN_CONTENT_MODEL;
}

export function normalizeLinkedInDiagramImageModel(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 100)
    : DEFAULT_LINKEDIN_DIAGRAM_IMAGE_MODEL;
}

export async function getAiSettings(userId: string) {
  return prisma.aiSettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      linkedinContentModel: DEFAULT_LINKEDIN_CONTENT_MODEL,
      linkedinDiagramImageModel: DEFAULT_LINKEDIN_DIAGRAM_IMAGE_MODEL,
    },
  });
}

export async function updateAiSettings(input: { userId: string; linkedinContentModel: string; linkedinDiagramImageModel: string }) {
  return prisma.aiSettings.upsert({
    where: { userId: input.userId },
    update: {
      linkedinContentModel: normalizeLinkedInContentModel(input.linkedinContentModel),
      linkedinDiagramImageModel: normalizeLinkedInDiagramImageModel(input.linkedinDiagramImageModel),
    },
    create: {
      userId: input.userId,
      linkedinContentModel: normalizeLinkedInContentModel(input.linkedinContentModel),
      linkedinDiagramImageModel: normalizeLinkedInDiagramImageModel(input.linkedinDiagramImageModel),
    },
  });
}

export async function getLinkedInContentModel(userId: string) {
  const settings = await getAiSettings(userId);
  return normalizeLinkedInContentModel(settings.linkedinContentModel);
}

export async function getLinkedInDiagramImageModel(userId: string) {
  const settings = await getAiSettings(userId);
  return normalizeLinkedInDiagramImageModel(settings.linkedinDiagramImageModel);
}
