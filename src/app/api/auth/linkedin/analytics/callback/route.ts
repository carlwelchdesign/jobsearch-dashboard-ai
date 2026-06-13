import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { applyLinkedInUserInfoToProfile, fetchLinkedInUserInfo } from "@/lib/linkedin/oidc";
import { exchangeLinkedInAnalyticsCodeForToken, saveLinkedInAnalyticsConnection } from "@/lib/linkedin/analytics";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = request.headers.get("cookie")?.match(/linkedin_analytics_state=([^;]+)/)?.[1];
    if (!code || !state || !expectedState || state !== expectedState) {
      return NextResponse.json({ error: "Invalid LinkedIn analytics callback state." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const token = await exchangeLinkedInAnalyticsCodeForToken({ code, origin: url.origin });
    if (!token.access_token) {
      return NextResponse.json({ error: token.error_description ?? token.error ?? "LinkedIn analytics token exchange failed." }, { status: 400 });
    }

    const info = await fetchLinkedInUserInfo(token.access_token);
    await applyLinkedInUserInfoToProfile(user.id, info);
    await saveLinkedInAnalyticsConnection({
      userId: user.id,
      accessToken: token.access_token,
      expiresInSeconds: token.expires_in,
      scopes: token.scope,
      linkedinSubject: info.sub,
    });

    const response = NextResponse.redirect(new URL("/dashboard?linkedinAnalytics=connected", url.origin));
    response.cookies.delete("linkedin_analytics_state");
    return response;
  } catch (error) {
    return apiError(error, 400);
  }
}
