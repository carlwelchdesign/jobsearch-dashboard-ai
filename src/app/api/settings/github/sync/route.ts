import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { syncGithubRepositoryEvidence } from "@/lib/evidence/ingest";
import { syncGithubRepositories } from "@/lib/github/context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await prisma.user.findFirst({
      include: { profile: true },
      orderBy: { createdAt: "asc" },
    });

    if (!user?.profile?.githubUrl) {
      return NextResponse.json({ error: "Set a GitHub profile URL in Settings before syncing." }, { status: 400 });
    }

    const result = await syncGithubRepositories(user.profile.id, user.profile.githubUrl);
    const evidence = await syncGithubRepositoryEvidence(user.profile.id, result.repositories);

    return NextResponse.json({
      evidenceCount: evidence.length,
      message: `Synced ${result.count} GitHub repositories and ${evidence.length} evidence items for ${result.username}.`,
      ...result,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
