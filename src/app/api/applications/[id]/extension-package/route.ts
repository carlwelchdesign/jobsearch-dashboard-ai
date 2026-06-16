import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { applicationAssistantPackageForId } from "@/lib/applications/assistant-package";
import { assessApplicationUrlQuality, atsProviderFromApplicationUrl } from "@/lib/applications/application-url-quality";
import { browserExtensionAuthError } from "@/lib/browser-extension-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const authError = browserExtensionAuthError(request);
    if (authError) return authError;

    const requestUrl = new URL(request.url);
    const currentUrl = parseCurrentUrl(requestUrl.searchParams.get("currentUrl"));
    if (currentUrl) {
      const quality = assessApplicationUrlQuality(currentUrl);
      if (!quality.launchable) {
        return NextResponse.json({
          error: `Direct application URL required. ${quality.reason}`,
          applicationUrlQuality: quality,
        }, { status: 400 });
      }
      const application = await prisma.application.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          jobPostingId: true,
          jobPosting: {
            select: {
              applicationUrl: true,
              rawData: true,
            },
          },
        },
      });
      if (!application) {
        return NextResponse.json({ error: "Application not found." }, { status: 404 });
      }

      await prisma.jobPosting.update({
        where: { id: application.jobPostingId },
        data: {
          applicationUrl: currentUrl,
          atsProvider: atsProviderFromApplicationUrl(currentUrl),
          rawData: {
            ...(isRecord(application.jobPosting.rawData) ? application.jobPosting.rawData : {}),
            extensionSelectedFill: {
              previousUrl: application.jobPosting.applicationUrl,
              applicationUrl: currentUrl,
              applicationUrlQuality: quality,
              capturedAt: new Date().toISOString(),
              source: "chrome_extension_selected_ready_application",
            },
          } as Prisma.InputJsonValue,
        },
      });
    }

    const result = await applicationAssistantPackageForId(params.id, requestUrl.origin);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return apiError(error, 400);
  }
}

function parseCurrentUrl(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Current tab URL must use http or https.");
  }
  return parsed.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
