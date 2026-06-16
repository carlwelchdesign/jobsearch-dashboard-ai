import { NextResponse } from "next/server";
import { configuredSecret, requiresConfiguredSecrets } from "@/lib/security/cron-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type HealthCheck = {
  id: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export async function GET() {
  const checks: HealthCheck[] = [];
  const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ id: "database", status: "pass", detail: "Postgres responded to a readiness query." });
  } catch (error) {
    checks.push({ id: "database", status: "fail", detail: error instanceof Error ? error.message : "Database readiness query failed." });
  }

  try {
    const [staleSearchRuns, staleAgentRuns] = await Promise.all([
      prisma.jobSearchRun.count({ where: { status: "running", startedAt: { lt: staleCutoff } } }),
      prisma.agentRun.count({ where: { status: { in: ["PENDING", "RUNNING"] }, updatedAt: { lt: staleCutoff } } }),
    ]);
    checks.push({
      id: "stale-work",
      status: staleSearchRuns || staleAgentRuns ? "warn" : "pass",
      detail: `${staleSearchRuns} stale search run(s), ${staleAgentRuns} stale agent run(s).`,
    });
  } catch (error) {
    checks.push({ id: "stale-work", status: "warn", detail: error instanceof Error ? error.message : "Could not inspect stale work." });
  }

  const secretChecks = [
    { id: "cron-secret", envNames: ["CRON_SECRET"], label: "Cron" },
    { id: "email-sync-secret", envNames: ["EMAIL_SYNC_SECRET", "CRON_SECRET"], label: "Email sync" },
    { id: "linkedin-analytics-secret", envNames: ["LINKEDIN_ANALYTICS_SYNC_SECRET", "CRON_SECRET"], label: "LinkedIn analytics sync" },
  ];
  for (const check of secretChecks) {
    const configured = Boolean(configuredSecret(check.envNames));
    checks.push({
      id: check.id,
      status: configured ? "pass" : requiresConfiguredSecrets() ? "fail" : "warn",
      detail: configured
        ? `${check.label} bearer secret is configured.`
        : `${check.label} bearer secret is not configured${requiresConfiguredSecrets() ? " and is required in this environment" : " for local development"}.`,
    });
  }

  checks.push({
    id: "openai-provider",
    status: process.env.OPENAI_API_KEY?.trim() ? "pass" : "warn",
    detail: process.env.OPENAI_API_KEY?.trim()
      ? "OpenAI provider key is configured."
      : "OpenAI provider key is not configured; deterministic fallbacks will be used where available.",
  });
  checks.push({
    id: "embeddings-worker",
    status: process.env.EMBEDDINGS_WORKER_DISABLED === "true" ? "warn" : "pass",
    detail: process.env.EMBEDDINGS_WORKER_DISABLED === "true"
      ? "Embeddings worker is explicitly disabled."
      : "Embeddings worker is available when the worker process is running.",
  });

  const status = checks.some((check) => check.status === "fail")
    ? "fail"
    : checks.some((check) => check.status === "warn")
      ? "degraded"
      : "ok";

  return NextResponse.json({
    status,
    generatedAt: new Date().toISOString(),
    checks,
  }, { status: status === "fail" ? 503 : 200 });
}
