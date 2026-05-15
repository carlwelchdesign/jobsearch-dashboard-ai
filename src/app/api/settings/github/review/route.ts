import { NextResponse } from "next/server";
import { runGithubPortfolioReviewAgent } from "@/lib/agents/github-portfolio-review";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    const result = await runGithubPortfolioReviewAgent({ userId: user?.id });

    return NextResponse.json(result.output);
  } catch (error) {
    return apiError(error, 400);
  }
}
