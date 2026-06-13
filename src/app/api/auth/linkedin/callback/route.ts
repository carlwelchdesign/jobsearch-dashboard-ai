import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { applyLinkedInUserInfoToProfile, exchangeLinkedInCodeForToken, fetchLinkedInUserInfo } from "@/lib/linkedin/oidc";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = request.headers.get("cookie")?.match(/linkedin_oidc_state=([^;]+)/)?.[1];
    if (!code || !state || !expectedState || state !== expectedState) {
      return NextResponse.json({ error: "Invalid LinkedIn callback state." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const token = await exchangeLinkedInCodeForToken({ code, origin: url.origin });
    if (!token.access_token) {
      return NextResponse.json({ error: token.error_description ?? token.error ?? "LinkedIn token exchange failed." }, { status: 400 });
    }

    const info = await fetchLinkedInUserInfo(token.access_token);
    await applyLinkedInUserInfoToProfile(user.id, info);

    const response = NextResponse.redirect(new URL("/settings/application#settings-profile-links", url.origin));
    response.cookies.delete("linkedin_oidc_state");
    return response;
  } catch (error) {
    return apiError(error, 400);
  }
}
