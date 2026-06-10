import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { emailOAuthConfig, normalizeEmailOAuthProvider, saveEmailOAuthConnection } from "@/lib/email/oauth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  try {
    const provider = normalizeEmailOAuthProvider(params.provider);
    if (!provider) return NextResponse.json({ error: "Unsupported email OAuth provider." }, { status: 404 });

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = request.headers.get("cookie")?.match(new RegExp(`email_oauth_state_${provider}=([^;]+)`))?.[1];
    if (!code || !state || !expectedState || state !== expectedState) {
      return NextResponse.json({ error: "Invalid OAuth callback state." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const config = emailOAuthConfig(provider, url.origin);
    const token = await exchangeCodeForToken({
      code,
      tokenUrl: config.tokenUrl,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    if (!token.access_token) {
      return NextResponse.json({ error: token.error_description ?? token.error ?? "OAuth token exchange failed." }, { status: 400 });
    }

    await saveEmailOAuthConnection({
      userId: user.id,
      provider,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresInSeconds: token.expires_in ?? null,
      scopes: token.scope?.split(/\s+/).filter(Boolean) ?? config.scopes,
      emailAddress: user.email,
    });

    const response = NextResponse.redirect(new URL("/settings/system#settings-email-sync", url.origin));
    response.cookies.delete(`email_oauth_state_${provider}`);
    return response;
  } catch (error) {
    return apiError(error, 400);
  }
}

async function exchangeCodeForToken(input: {
  code: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const response = await fetch(input.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
    }),
  });

  return response.json().catch(() => ({ error: "invalid_token_response" }));
}
