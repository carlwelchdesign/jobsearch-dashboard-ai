import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ServiceCheckResult = {
  id: string;
  status: "ok" | "error" | "skipped";
  message?: string;
};

async function checkOpenAI(): Promise<ServiceCheckResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { id: "openai", status: "skipped", message: "Not configured" };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) return { id: "openai", status: "ok" };
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
    return { id: "openai", status: "error", message: body?.error?.message ?? `HTTP ${res.status}` };
  } catch (err) {
    return { id: "openai", status: "error", message: err instanceof Error ? err.message : "Connection failed" };
  }
}

async function checkGitHub(): Promise<ServiceCheckResult> {
  const token = process.env.GITHUB_TOKEN;
  try {
    const res = await fetch("https://api.github.com/rate_limit", {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}`, "User-Agent": "job-search-os" } : { "User-Agent": "job-search-os" }),
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      if (!token) return { id: "github_token", status: "skipped", message: "Unauthenticated — lower rate limit applies" };
      return { id: "github_token", status: "ok" };
    }
    if (res.status === 401) return { id: "github_token", status: "error", message: "Invalid token" };
    return { id: "github_token", status: token ? "ok" : "skipped" };
  } catch (err) {
    return { id: "github_token", status: "error", message: err instanceof Error ? err.message : "Connection failed" };
  }
}

async function checkBrave(): Promise<ServiceCheckResult> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return { id: "brave", status: "skipped", message: "Not configured" };
  try {
    const res = await fetch("https://api.search.brave.com/res/v1/web/search?q=test&count=1", {
      headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": key },
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 401 || res.status === 403) return { id: "brave", status: "error", message: "Invalid API key" };
    return { id: "brave", status: "ok" };
  } catch (err) {
    return { id: "brave", status: "error", message: err instanceof Error ? err.message : "Connection failed" };
  }
}

async function checkResend(): Promise<ServiceCheckResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { id: "resend", status: "skipped", message: "Not configured" };
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) return { id: "resend", status: "ok" };
    if (res.status === 401 || res.status === 403) return { id: "resend", status: "error", message: "Invalid API key" };
    return { id: "resend", status: "ok" };
  } catch (err) {
    return { id: "resend", status: "error", message: err instanceof Error ? err.message : "Connection failed" };
  }
}

async function checkLangSmith(): Promise<ServiceCheckResult> {
  const key = process.env.LANGSMITH_API_KEY;
  const tracing = process.env.LANGSMITH_TRACING === "true";
  if (!key || !tracing) return { id: "langsmith", status: "skipped", message: "Not configured" };
  const endpoint = process.env.LANGSMITH_ENDPOINT ?? "https://api.smith.langchain.com";
  try {
    const res = await fetch(`${endpoint}/info`, {
      headers: { "X-Api-Key": key },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) return { id: "langsmith", status: "ok" };
    if (res.status === 401 || res.status === 403) return { id: "langsmith", status: "error", message: "Invalid API key" };
    return { id: "langsmith", status: "ok" };
  } catch (err) {
    return { id: "langsmith", status: "error", message: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function GET() {
  const settled = await Promise.allSettled([
    checkOpenAI(),
    checkGitHub(),
    checkBrave(),
    checkResend(),
    checkLangSmith(),
  ]);

  const fallbackIds = ["openai", "github_token", "brave", "resend", "langsmith"];
  const results: ServiceCheckResult[] = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return { id: fallbackIds[index], status: "error" as const, message: "Check failed unexpectedly" };
  });

  return NextResponse.json({ checkedAt: new Date().toISOString(), results });
}
