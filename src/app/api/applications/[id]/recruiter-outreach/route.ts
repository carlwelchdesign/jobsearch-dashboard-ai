import { NextResponse } from "next/server";
import { runRecruiterIntelligenceAgent } from "@/lib/agents/recruiter-intelligence";
import { apiError } from "@/lib/api";
import { syncApplicationPacket } from "@/lib/applications/application-packets";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await runRecruiterIntelligenceAgent({ applicationId: params.id });
    await syncApplicationPacket(params.id);
    return NextResponse.json(result.output);
  } catch (error) {
    return apiError(error, 400);
  }
}
