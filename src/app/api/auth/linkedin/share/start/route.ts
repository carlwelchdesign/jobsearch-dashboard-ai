import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { buildLinkedInShareAuthorizeUrl } from "@/lib/linkedin/share";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const state = randomBytes(24).toString("hex");
    const origin = new URL(request.url).origin;
    const url = buildLinkedInShareAuthorizeUrl({ state, origin });
    const response = NextResponse.redirect(url);
    response.cookies.set("linkedin_share_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return apiError(error, 400);
  }
}
