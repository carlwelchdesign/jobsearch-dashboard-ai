import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { buildLinkedInOidcAuthorizeUrl } from "@/lib/linkedin/oidc";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const state = randomBytes(24).toString("hex");
    const origin = new URL(request.url).origin;
    const url = buildLinkedInOidcAuthorizeUrl({ state, origin });
    const response = NextResponse.redirect(url);
    response.cookies.set("linkedin_oidc_state", state, {
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
