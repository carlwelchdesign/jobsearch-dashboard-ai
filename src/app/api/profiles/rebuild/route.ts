import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { rebuildSearchProfilesFromRecruitingBoard } from "@/lib/profiles/rebuild-search-profiles";

export const dynamic = "force-dynamic";

const rebuildSchema = z.object({
  confirm: z.literal("CLEAR_AND_REBUILD"),
});

export async function POST(request: Request) {
  try {
    rebuildSchema.parse(await request.json());
    const result = await rebuildSearchProfilesFromRecruitingBoard();

    return NextResponse.json({
      ...result,
      message: `Cleared ${result.deletedProfiles} search profile(s) and created ${result.createdProfiles} board-recommended profile(s).`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
