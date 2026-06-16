import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireSingleUser } from "@/lib/auth/single-user";
import { startJobSearchRun } from "@/lib/job-search/start-run";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireSingleUser(request);
    const result = await startJobSearchRun("manual");
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return apiError(error, 400);
  }
}
