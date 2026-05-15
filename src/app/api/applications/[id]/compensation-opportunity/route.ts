import { NextResponse } from "next/server";
import { runCompensationOpportunityAgent } from "@/lib/agents/compensation-opportunity";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await runCompensationOpportunityAgent({ applicationId: params.id });
    return NextResponse.json(result.output);
  } catch (error) {
    return apiError(error, 400);
  }
}
