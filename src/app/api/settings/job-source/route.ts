import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const boardUrl = normalizeUrl(body.boardUrl);
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : await inferJobFrontName(boardUrl);
    const organizationId = typeof body.organizationId === "string" && body.organizationId.trim()
      ? body.organizationId.trim()
      : await inferJobFrontOrganizationId(boardUrl);
    const maxFetch = typeof body.maxFetch === "number" && Number.isFinite(body.maxFetch) ? Math.max(1, Math.round(body.maxFetch)) : 160;

    const source = await prisma.jobSource.upsert({
      where: { type_name: { type: "jobfront", name } },
      update: {
        baseUrl: boardUrl,
        enabled: true,
        config: {
          qualityTier: "jobfront_board",
          boardUrl,
          organizationId,
          maxFetch,
        },
      },
      create: {
        name,
        type: "jobfront",
        baseUrl: boardUrl,
        enabled: true,
        config: {
          qualityTier: "jobfront_board",
          boardUrl,
          organizationId,
          maxFetch,
        },
      },
    });

    return NextResponse.json({
      source,
      message: `${source.name} added as a JobFront source.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function normalizeUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Board URL is required.");
  const url = new URL(value.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Board URL must be HTTP or HTTPS.");
  return url.origin;
}

async function inferJobFrontName(boardUrl: string) {
  const html = await fetchBoardHtml(boardUrl);
  const title = /<meta\s+property="og:site_name"\s+content="([^"]+)"/i.exec(html)?.[1]
    ?? /<title>\s*Jobs at\s*([^<]+)<\/title>/i.exec(html)?.[1];
  return cleanup(title ?? new URL(boardUrl).hostname.replace(/^jobs\./, ""));
}

async function inferJobFrontOrganizationId(boardUrl: string) {
  const html = await fetchBoardHtml(boardUrl);
  const found = /api\/organizations\/'\+'([^']+)'/.exec(html)
    ?? /\/api\/organizations\/([A-Za-z0-9_-]+)\/sources/.exec(html)
    ?? /pagination_organization_id['"]?\s*[:=]\s*['"]([A-Za-z0-9_-]+)['"]/.exec(html);
  return found?.[1] ?? "";
}

async function fetchBoardHtml(boardUrl: string) {
  const response = await fetch(boardUrl, {
    headers: { Accept: "text/html", "User-Agent": "JobSearchOS/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Board returned ${response.status}.`);
  return response.text();
}

function cleanup(value: string) {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
