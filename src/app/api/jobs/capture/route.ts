import { AtsProvider, RemoteType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { runJobFitScoringAgent } from "@/lib/agents/job-fit-scorer";
import { apiError } from "@/lib/api";
import { captureManualJob } from "@/lib/jobs/manual-capture";
import { createProfileFromZeroMatchCapture } from "@/lib/profiles/capture-profile-learning";

export const dynamic = "force-dynamic";

const captureSchema = z.object({
  pageUrl: z.string().url().optional(),
  applicationUrl: z.string().url().optional(),
  company: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  location: z.string().trim().max(300).optional(),
  description: z.string().trim().max(100000).optional(),
  selectedText: z.string().trim().max(100000).optional(),
  pageTitle: z.string().trim().max(500).optional(),
  remoteType: z.nativeEnum(RemoteType).optional(),
  atsProvider: z.nativeEnum(AtsProvider).optional(),
  sourceName: z.string().trim().max(120).default("Chrome Capture"),
  metadata: z.record(z.unknown()).default({}),
});

export async function POST(request: Request) {
  try {
    const configuredToken = process.env.BROWSER_EXTENSION_TOKEN?.trim();
    if (configuredToken && request.headers.get("x-job-search-os-token") !== configuredToken) {
      return NextResponse.json({ error: "Invalid browser extension token." }, { status: 401 });
    }

    const body = captureSchema.parse(await request.json());
    const result = await captureManualJob({
      company: body.company,
      title: body.title ?? inferTitleFromPageTitle(body.pageTitle),
      location: body.location,
      description: body.description ?? body.selectedText,
      text: body.selectedText,
      applicationUrl: body.applicationUrl,
      pageUrl: body.pageUrl,
      remoteType: body.remoteType,
      atsProvider: body.atsProvider,
      sourceName: body.sourceName,
      rawData: {
        pageTitle: body.pageTitle ?? null,
        selectedText: body.selectedText ?? null,
        metadata: body.metadata,
      },
    });
    const learnedProfile = result.matches.length === 0
      ? await createProfileFromZeroMatchCapture(result.job)
      : null;
    const learnedMatch = learnedProfile?.created && learnedProfile.profile
      ? await runJobFitScoringAgent({
          jobPostingId: result.job.id,
          jobSearchProfileId: learnedProfile.profile.id,
        }).then((agentResult) => agentResult.output).catch(() => null)
      : null;
    const matches = learnedMatch ? [...result.matches, learnedMatch] : result.matches;

    return NextResponse.json({
      ...result,
      jobUrl: `/jobs/${result.job.id}`,
      matches,
      matchCount: matches.length,
      initialMatchCount: result.matches.length,
      profileCreated: Boolean(learnedProfile?.created),
      profileName: learnedProfile?.profile?.name ?? null,
      profileUrl: learnedProfile?.profile ? "/profiles" : null,
      message: result.created ? "Captured job from browser." : "Updated existing captured job.",
    }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return apiError(error, 400);
  }
}

function inferTitleFromPageTitle(pageTitle?: string) {
  if (!pageTitle) return undefined;
  const [firstPart] = pageTitle.split("|").map((part) => part.trim()).filter(Boolean);
  return firstPart;
}
