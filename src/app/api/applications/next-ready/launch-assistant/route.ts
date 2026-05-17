import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { startApplicationAssistantWorkflow } from "@/lib/applications/assistant-workflow";
import { isLocalAssistantRequest, LOCAL_ASSISTANT_ERROR } from "@/lib/applications/local-assistant-origin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    if (!isLocalAssistantRequest(url)) {
      return NextResponse.json(
        { error: LOCAL_ASSISTANT_ERROR },
        { status: 400 },
      );
    }

    const applications = await prisma.application.findMany({
      where: {
        status: "ready_to_apply",
        resumeId: { not: null },
        coverLetterId: { not: null },
        jobPosting: {
          applicationUrl: { not: null },
          NOT: [
            { applicationUrl: { contains: "example.com", mode: "insensitive" } },
            { applicationUrl: { contains: "remoteok.com", mode: "insensitive" } },
          ],
        },
        agentUserRequests: {
          none: { status: "OPEN" },
        },
      },
      include: {
        events: {
          where: { type: "note_added" },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        jobProfileMatch: true,
        jobPosting: true,
      },
      orderBy: [
        { jobProfileMatch: { overallScore: "desc" } },
        { updatedAt: "desc" },
      ],
      take: 50,
    });
    const application = applications.find((candidate) => !hasAssistantLaunch(candidate.events));

    if (!application) {
      return NextResponse.json({ error: "No unlaunched ready_to_apply application with generated materials is available." }, { status: 404 });
    }

    const result = await startApplicationAssistantWorkflow(application.id, url.origin);
    return NextResponse.json({
      ...result,
      matchScore: application.jobProfileMatch?.overallScore ?? null,
      message: `Assistant launched next unlaunched ready application: ${application.jobPosting.company} - ${application.jobPosting.title}. Review and submit manually.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function hasAssistantLaunch(events: Array<{ payload: unknown }>) {
  return events.some((event) => {
    const payload = event.payload as { note?: string } | null;
    return payload?.note === "Local Playwright assistant launched. Manual submit checkpoint required.";
  });
}
