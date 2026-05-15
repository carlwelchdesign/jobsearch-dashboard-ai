import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { backfillCandidateEvidence } from "@/lib/evidence/ingest";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const evidence = await backfillCandidateEvidence();
    return NextResponse.json({
      count: evidence.length,
      message: `Backfilled ${evidence.length} evidence item${evidence.length === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
