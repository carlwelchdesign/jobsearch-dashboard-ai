import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { backfillApplicationPackets } from "@/lib/applications/application-packets";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await backfillApplicationPackets(typeof body.limit === "number" ? body.limit : 200);
    await reconcileApplicationCanonicalState({ source: "packet_backfill" }).catch(() => null);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 400);
  }
}
