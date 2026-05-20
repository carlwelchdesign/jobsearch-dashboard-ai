import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { customOpportunityGenerateSchema, generateCustomOpportunityResume } from "@/lib/resumes/custom-opportunity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = customOpportunityGenerateSchema.parse(await request.json());
    const result = await generateCustomOpportunityResume(body);

    return NextResponse.json({
      jobUrl: result.jobUrl,
      resumeId: result.resumeId,
      pdfUrl: result.pdfUrl,
      textUrl: result.textUrl,
      resumePreview: result.resumePreview,
      warnings: result.warnings,
      inferredDetails: result.inferredDetails,
      message: "Custom opportunity resume generated.",
    }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}
