import { AtsProvider, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { assessApplicationUrlQuality, atsProviderFromApplicationUrl } from "@/lib/applications/application-url-quality";
import { isLocalAssistantRequest, LOCAL_ASSISTANT_ERROR } from "@/lib/applications/local-assistant-origin";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const applyNowSchema = z.object({
  applicationUrl: z.string().url(),
  pageUrl: z.string().url().optional(),
  atsProvider: z.nativeEnum(AtsProvider).optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const url = new URL(request.url);
    if (!isLocalAssistantRequest(url)) {
      return NextResponse.json(
        { error: LOCAL_ASSISTANT_ERROR },
        { status: 400 },
      );
    }

    const configuredToken = process.env.BROWSER_EXTENSION_TOKEN?.trim();
    if (configuredToken && request.headers.get("x-job-search-os-token") !== configuredToken) {
      return NextResponse.json({ error: "Invalid browser extension token." }, { status: 401 });
    }

    const body = applyNowSchema.parse(await request.json());
    const quality = assessApplicationUrlQuality(body.applicationUrl);
    if (!quality.launchable) {
      return NextResponse.json({
        error: `Direct application URL required. ${quality.reason}`,
        applicationUrlQuality: quality,
      }, { status: 400 });
    }
    const existing = await prisma.jobPosting.findUnique({
      where: { id: params.id },
      select: { rawData: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    const job = await prisma.jobPosting.update({
      where: { id: params.id },
      data: {
        applicationUrl: body.applicationUrl,
        atsProvider: body.atsProvider ?? atsProviderFromApplicationUrl(body.applicationUrl),
        rawData: {
          ...(isRecord(existing.rawData) ? existing.rawData : {}),
          applyNow: {
            applicationUrl: body.applicationUrl,
            applicationUrlQuality: quality,
            pageUrl: body.pageUrl ?? null,
            capturedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        company: true,
        title: true,
        applicationUrl: true,
      },
    });
    const prepared = await prepareApplicationPackage(job.id);
    if (prepared.readyToApply === false) {
      return NextResponse.json({
        error: `Application material quality needs review. ${prepared.materialQuality.reason}`,
        applicationId: prepared.application.id,
        resumeId: prepared.resume.id,
        coverLetterId: prepared.coverLetter.id,
        materialQuality: prepared.materialQuality,
      }, { status: 400 });
    }
    const { startApplicationAssistantWorkflow } = await import("@/lib/applications/assistant-workflow-graph");
    const launch = await startApplicationAssistantWorkflow(prepared.application.id, url.origin);

    return NextResponse.json({
      ...launch,
      job,
      applicationId: prepared.application.id,
      resumeId: prepared.resume.id,
      coverLetterId: prepared.coverLetter.id,
      applicationUrl: body.applicationUrl,
      message: launch.message ?? `Assistant launched for ${job.company} - ${job.title}. Review and submit manually.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
