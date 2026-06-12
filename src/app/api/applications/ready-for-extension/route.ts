import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { browserExtensionAuthError } from "@/lib/browser-extension-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authError = browserExtensionAuthError(request);
    if (authError) return authError;
    const requestUrl = new URL(request.url);
    const currentUrl = canonicalUrl(requestUrl.searchParams.get("currentUrl"));

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
            description: true,
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
        { updatedAt: "desc" },
        { jobProfileMatch: { overallScore: "desc" } },
      ],
      take: 200,
    });
    const sortedApplications = currentUrl
      ? [...applications].sort((left, right) => Number(applicationUrlMatches(right.jobPosting.applicationUrl, currentUrl)) - Number(applicationUrlMatches(left.jobPosting.applicationUrl, currentUrl)))
      : applications;

    return NextResponse.json({
      applications: sortedApplications.map((application) => ({
        id: application.id,
        jobPostingId: application.jobPosting.id,
        company: application.jobPosting.company,
        title: application.jobPosting.title,
        location: application.jobPosting.location,
        description: application.jobPosting.description,
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

function canonicalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().replace(/\/$/, "") || null;
  }
}

function applicationUrlMatches(value: string | null, currentUrl: string) {
  const canonical = canonicalUrl(value);
  if (!canonical) return false;
  if (canonical === currentUrl) return true;
  try {
    const left = new URL(canonical);
    const right = new URL(currentUrl);
    return left.hostname === right.hostname && left.pathname === right.pathname;
  } catch {
    return false;
  }
}
