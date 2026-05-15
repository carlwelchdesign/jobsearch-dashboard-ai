import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { evaluateAutoSubmitEligibility } from "@/lib/applications/auto-submit-policy";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const eligibility = await evaluateAutoSubmitEligibility(params.id);
    return NextResponse.json({ eligibility });
  } catch (error) {
    if (error instanceof Error && error.message === "Application not found.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return apiError(error, 400);
  }
}
