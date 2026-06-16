import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { prepareApplicationPackage } from "@/lib/applications/prepare-package";
import { syncApplicationPacket } from "@/lib/applications/application-packets";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";
import { transitionApplicationState } from "@/lib/applications/state-transitions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  limit: z.number().int().min(1).max(50).default(25),
});

const movableStatuses = ["approved", "resume_generated", "cover_letter_generated"] as const;

export async function POST(request: Request) {
  try {
    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
    const input = requestSchema.parse(body);
    const applications = await prisma.application.findMany({
      where: {
        status: { in: [...movableStatuses] },
        jobPosting: { applicationUrl: { not: null } },
      },
      include: {
        jobPosting: { select: { id: true, company: true, title: true, applicationUrl: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: input.limit,
    });

    const results: Array<{
      ok: boolean;
      applicationId: string;
      jobId: string;
      company: string;
      title: string;
      action: "moved" | "prepared" | "failed";
      error?: string;
    }> = [];

    for (const application of applications) {
      try {
        if (application.resumeId && application.coverLetterId) {
          await transitionApplicationState({
            applicationId: application.id,
            toStatus: "ready_to_apply",
            source: "bulk_move_to_apply_sprint",
            actor: { type: "system" },
            reason: "Bulk move prepared application for Apply Sprint.",
            note: mergeSprintNote(application.notes),
            metadata: {
              resumeId: application.resumeId,
              coverLetterId: application.coverLetterId,
              applicationUrl: application.jobPosting.applicationUrl,
              manualSubmissionRequired: true,
            },
            sideEffects: { syncPacket: false },
          });
          await syncApplicationPacket(application.id);
          results.push({
            ok: true,
            applicationId: application.id,
            jobId: application.jobPostingId,
            company: application.jobPosting.company,
            title: application.jobPosting.title,
            action: "moved",
          });
          continue;
        }

        const prepared = await prepareApplicationPackage(application.jobPostingId);
        results.push({
          ok: true,
          applicationId: prepared.application.id,
          jobId: application.jobPostingId,
          company: application.jobPosting.company,
          title: application.jobPosting.title,
          action: "prepared",
        });
      } catch (error) {
        results.push({
          ok: false,
          applicationId: application.id,
          jobId: application.jobPostingId,
          company: application.jobPosting.company,
          title: application.jobPosting.title,
          action: "failed",
          error: error instanceof Error ? error.message : "Unknown Apply Sprint move failure",
        });
      }
    }

    await reconcileApplicationCanonicalState({ source: "bulk_move_to_apply_sprint" }).catch(() => null);

    const moved = results.filter((result) => result.ok && result.action === "moved").length;
    const prepared = results.filter((result) => result.ok && result.action === "prepared").length;
    const failed = results.filter((result) => !result.ok).length;
    const totalMoved = moved + prepared;

    return NextResponse.json({
      requested: input,
      scanned: applications.length,
      moved,
      prepared,
      failed,
      results,
      sprintUrl: "/applications/assistant",
      message: totalMoved
        ? `Moved ${totalMoved} application${totalMoved === 1 ? "" : "s"} into Apply Sprint. ${failed} failed.`
        : failed
          ? `No applications moved into Apply Sprint. ${failed} failed.`
          : "No approved applications are waiting to move into Apply Sprint.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function mergeSprintNote(existing: string | null) {
  const note = "Moved to Apply Sprint. Review materials and submit manually.";
  if (!existing) return note;
  return existing.includes(note) ? existing : `${existing}\n${note}`;
}
