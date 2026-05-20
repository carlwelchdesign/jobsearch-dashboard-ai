import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { customOpportunityInferSchema, inferCustomOpportunityDetails } from "@/lib/resumes/custom-opportunity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = customOpportunityInferSchema.parse(await request.json());
    const details = await inferCustomOpportunityDetails(body.description);

    return NextResponse.json({ details });
  } catch (error) {
    return apiError(error, 400);
  }
}
