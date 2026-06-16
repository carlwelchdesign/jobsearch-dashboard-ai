import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireSingleUser } from "@/lib/auth/single-user";
import { buildLifecycleReadiness } from "@/lib/readiness/lifecycle";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSingleUser(request);
    const readiness = await buildLifecycleReadiness({ userId: user.id });
    return NextResponse.json(readiness);
  } catch (error) {
    return apiError(error, 401);
  }
}
