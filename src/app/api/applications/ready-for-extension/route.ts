import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { browserExtensionAuthError } from "@/lib/browser-extension-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authError = browserExtensionAuthError(request);
    if (authError) return authError;

    const applications = await prisma.application.findMany({
      where: {
        status: "ready_to_apply",
        resumeId: { not: null },
        coverLetterId: { not: null },
        jobPosting: { applicationUrl: { not: null } },
      },
      select: {
        id: true,
        updatedAt: true,
        jobPosting: {
          select: {
            id: true,
            company: true,
            title: true,
            location: true,
            applicationUrl: true,
            atsProvider: true,
          },
        },
        jobProfileMatch: {
          select: {
            overallScore: true,
          },
        },
      },
      orderBy: [
        { jobProfileMatch: { overallScore: "desc" } },
        { updatedAt: "desc" },
      ],
      take: 200,
    });

    return NextResponse.json({
      applications: applications.map((application) => ({
        id: application.id,
        jobPostingId: application.jobPosting.id,
        company: application.jobPosting.company,
        title: application.jobPosting.title,
        location: application.jobPosting.location,
        score: application.jobProfileMatch?.overallScore ?? null,
        applicationUrl: application.jobPosting.applicationUrl,
        atsProvider: application.jobPosting.atsProvider,
        updatedAt: application.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
