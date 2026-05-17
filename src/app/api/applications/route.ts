import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { applicationJobKeySet, hasApplicationForJob } from "@/lib/applications/job-filters";
import { reconcileApplicationCanonicalState, visibleCanonicalApplications } from "@/lib/applications/reconciliation";
import { recordSubmittedJobSuppression } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const createApplicationSchema = z.object({
  jobPostingId: z.string().min(1),
  jobProfileMatchId: z.string().optional(),
  status: z.enum(["approved", "ready_to_apply", "applied", "follow_up_due", "screening", "interviewing", "offer", "archived"]).default("approved"),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    await reconcileApplicationCanonicalState({ source: "applications_api" }).catch(() => null);
    const applications = await prisma.application.findMany({
      include: {
        jobPosting: true,
        jobProfileMatch: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ applications: visibleCanonicalApplications(applications) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = createApplicationSchema.parse(await request.json());
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const [jobPosting, existingApplications] = await Promise.all([
      prisma.jobPosting.findUnique({
        where: { id: body.jobPostingId },
        select: {
          id: true,
          company: true,
          title: true,
          location: true,
          duplicateGroupId: true,
          lastSeenAt: true,
        },
      }),
      prisma.application.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          status: true,
          jobPosting: {
            select: {
              company: true,
              title: true,
              location: true,
              lastSeenAt: true,
            },
          },
        },
      }),
    ]);

    if (!jobPosting) return NextResponse.json({ error: "Job posting not found." }, { status: 404 });

    const existingApplicationKeys = applicationJobKeySet(existingApplications);
    if (hasApplicationForJob(jobPosting, existingApplicationKeys)) {
      return NextResponse.json({ error: "This job is already tracked as an application." }, { status: 409 });
    }

    const application = await prisma.application.create({
      data: {
        userId: user.id,
        jobPostingId: body.jobPostingId,
        jobProfileMatchId: body.jobProfileMatchId || null,
        status: body.status,
        approvedAt: body.status === "approved" ? new Date() : null,
        appliedAt: body.status === "applied" ? new Date() : null,
        notes: body.notes,
      },
    });

    if (body.jobProfileMatchId) {
      await prisma.jobProfileMatch.update({
        where: { id: body.jobProfileMatchId },
        data: { status: body.status },
      });
    }
    if (body.status === "applied") {
      await recordSubmittedJobSuppression({
        userId: user.id,
        job: jobPosting,
        jobProfileMatchId: body.jobProfileMatchId ?? null,
        applicationId: application.id,
        source: "application_create",
        reason: "created_applied_application",
      });
      await reconcileApplicationCanonicalState({ applicationId: application.id, source: "application_create" }).catch(() => null);
    }

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}
