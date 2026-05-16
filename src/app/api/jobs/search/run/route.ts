import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { startJobSearchRun } from "@/lib/job-search/start-run";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await startJobSearchRun("manual");
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiError(error, 400);
  }
}
