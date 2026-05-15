import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { captureManualJob } from "@/lib/jobs/manual-capture";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { job, matches } = await captureManualJob({
      ...body,
      sourceName: "Manual Paste",
      rawData: body,
    });

    return NextResponse.json({ job, matches }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}
