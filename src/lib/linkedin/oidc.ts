import { prisma } from "@/lib/prisma";

export type LinkedInUserInfo = {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string | { country?: string; language?: string };
  email?: string;
  email_verified?: boolean;
};

export type LinkedInTokenResponse = {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

const authorizeUrl = "https://www.linkedin.com/oauth/v2/authorization";
const tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken";
const userInfoUrl = "https://api.linkedin.com/v2/userinfo";
const scopes = ["openid", "profile", "email"];

export function linkedInOidcConfigured() {
  return Boolean(process.env.LINKEDIN_CLIENT_ID?.trim() && process.env.LINKEDIN_CLIENT_SECRET?.trim());
}

export function linkedInOidcConfig(origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("LinkedIn OIDC is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.");
  }

  return {
    clientId,
    clientSecret,
    redirectUri: process.env.LINKEDIN_OIDC_REDIRECT_URI?.trim() || `${origin}/api/auth/linkedin/callback`,
    authorizeUrl,
    tokenUrl,
    userInfoUrl,
    scopes,
  };
}

export function buildLinkedInOidcAuthorizeUrl(input: { state: string; origin?: string }) {
  const config = linkedInOidcConfig(input.origin);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", config.scopes.join(" "));
  return url;
}

export async function exchangeLinkedInCodeForToken(input: {
  code: string;
  origin?: string;
}): Promise<LinkedInTokenResponse> {
  const config = linkedInOidcConfig(input.origin);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  });

  return response.json().catch(() => ({ error: "invalid_token_response" }));
}

export async function fetchLinkedInUserInfo(accessToken: string): Promise<LinkedInUserInfo> {
  const config = linkedInOidcConfig();
  const response = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`LinkedIn userinfo returned HTTP ${response.status}.`);
  return response.json();
}

export async function applyLinkedInUserInfoToProfile(userId: string, info: LinkedInUserInfo) {
  if (!info.sub) throw new Error("LinkedIn userinfo did not include a subject.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user?.profile) throw new Error("No user profile exists to connect LinkedIn.");

  const locale = normalizeLocale(info.locale);
  const name = info.name?.trim() || [info.given_name, info.family_name].filter(Boolean).join(" ").trim();
  const email = info.email?.trim();

  const profile = await prisma.userProfile.update({
    where: { userId },
    data: {
      linkedinSubject: info.sub,
      linkedinPictureUrl: info.picture?.trim() || null,
      linkedinLocale: locale,
      linkedinEmailVerified: typeof info.email_verified === "boolean" ? info.email_verified : null,
      linkedinConnectedAt: new Date(),
      ...(user.profile.fullName.trim() ? {} : name ? { fullName: name } : {}),
      ...(user.profile.email.trim() ? {} : email ? { email } : {}),
    },
  });

  if (!user.name?.trim() && name) {
    await prisma.user.update({ where: { id: userId }, data: { name } });
  }

  return profile;
}

function normalizeLocale(value: LinkedInUserInfo["locale"]) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return [value.language, value.country].filter(Boolean).join("_") || null;
}
