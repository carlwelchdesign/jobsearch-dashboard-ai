import { NextResponse } from "next/server";
import { runPortfolioMatchAgent } from "@/lib/agents/portfolio-match";
import { apiError } from "@/lib/api";
import { syncApplicationPacket } from "@/lib/applications/application-packets";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await runPortfolioMatchAgent({ applicationId: params.id });
    await syncApplicationPacket(params.id);
    return NextResponse.json(result.output);
  } catch (error) {
    return apiError(error, 400);
  }
}
