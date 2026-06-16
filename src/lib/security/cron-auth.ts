import { NextResponse } from "next/server";

export type SecretAuthOptions = {
  envNames: string[];
  label: string;
};

export function requireBearerSecret(request: Request, options: SecretAuthOptions) {
  const secret = configuredSecret(options.envNames);
  if (!secret) {
    if (requiresConfiguredSecrets()) {
      return NextResponse.json(
        { error: `${options.label} secret is not configured.` },
        { status: 503 },
      );
    }
    return null;
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export function configuredSecret(envNames: string[]) {
  for (const envName of envNames) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }
  return "";
}

export function requiresConfiguredSecrets() {
  return process.env.REQUIRE_CRON_SECRETS === "true" || process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}
