import { NextResponse } from "next/server";

export function browserExtensionAuthError(request: Request) {
  const configuredToken = process.env.BROWSER_EXTENSION_TOKEN?.trim();
  if (configuredToken && request.headers.get("x-job-search-os-token") !== configuredToken) {
    return NextResponse.json({ error: "Invalid browser extension token." }, { status: 401 });
  }
  return null;
}
