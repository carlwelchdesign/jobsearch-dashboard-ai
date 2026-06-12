import { NextResponse } from "next/server";
import { z } from "zod";
import { approveJobMatchForApplication } from "@/lib/applications/approval";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const approveJobSchema = z.object({
  matchId: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { matchId } = approveJobSchema.parse(await request.json());
    const { match, application } = await approveJobMatchForApplication({
      jobPostingId: params.id,
      matchId,
      source: "job_approval",
    });

    return NextResponse.json({
      jobId: params.id,
      match,
      application,
      applicationUrl: application ? `/applications/${application.id}` : null,
      message: application
        ? `Approved ${match.jobPosting.company} - ${match.jobPosting.title} and created an application tracker.`
        : `Approved ${match.jobPosting.company} - ${match.jobPosting.title}.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
