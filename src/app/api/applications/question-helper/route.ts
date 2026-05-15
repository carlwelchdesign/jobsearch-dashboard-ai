import { NextResponse } from "next/server";
import { z } from "zod";
import { answerApplicationQuestion } from "@/lib/ai/application-question";
import { apiError } from "@/lib/api";
import { findReusableAnswerMemories } from "@/lib/application-answer-memory";
import { appendApplicationPacketAnswer } from "@/lib/applications/application-packets";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  question: z.string().trim().min(10).max(1200),
  applicationId: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  try {
    const { question, applicationId } = requestSchema.parse(await request.json());
    const profile = await prisma.userProfile.findFirst({
      include: {
        experienceBullets: { where: { truthLevel: "verified" }, orderBy: { createdAt: "desc" }, take: 120 },
        workExperiences: { orderBy: { createdAt: "desc" }, take: 80 },
        projects: { orderBy: { createdAt: "desc" }, take: 40 },
        githubRepositories: { orderBy: [{ pushedAt: "desc" }, { stars: "desc" }], take: 50 },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!profile) {
      return NextResponse.json({ error: "No approved candidate profile exists. Upload and approve a resume first." }, { status: 400 });
    }

    const answerMemory = await findReusableAnswerMemories(profile.userId, question, 3);
    const result = await answerApplicationQuestion({
      question,
      userProfile: profile,
      bullets: profile.experienceBullets,
      workExperiences: profile.workExperiences,
      projects: profile.projects,
      githubRepositories: profile.githubRepositories,
      answerMemory,
    });

    const savedAnswer = applicationId
      ? await appendApplicationPacketAnswer({
          applicationId,
          question,
          generatedBy: result.generatedBy,
          options: result.options,
        })
      : null;

    return NextResponse.json({
      question,
      ...result,
      savedToPacket: Boolean(savedAnswer),
      packetAnswerCount: savedAnswer?.answerCount ?? null,
      answerMemory,
      context: {
        bulletsConsidered: profile.experienceBullets.length,
        projectsConsidered: profile.projects.length,
        githubRepositoriesConsidered: profile.githubRepositories.length,
      },
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
