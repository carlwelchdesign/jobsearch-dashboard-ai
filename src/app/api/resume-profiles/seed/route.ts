import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { seedDefaultResumeProfiles } from "@/lib/resume-profiles/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const profiles = await seedDefaultResumeProfiles();
    return NextResponse.json({ count: profiles.length, message: "Default resume variants are ready." });
  } catch (error) {
    return apiError(error, 400);
  }
}
