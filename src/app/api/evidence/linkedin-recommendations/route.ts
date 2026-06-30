import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import {
  buildRecommendationBulletDrafts,
  buildRecommendationEvidenceDraft,
  parseLinkedInRecommendations,
} from "@/lib/evidence/linkedin-recommendations";
import { upsertEvidence } from "@/lib/evidence/ingest";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const linkedinRecommendationsSchema = z.object({
  rawText: z.string().min(20),
  mode: z.enum(["preview", "import"]).default("preview"),
  createProposedBullets: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const body = linkedinRecommendationsSchema.parse(await request.json());
    const entries = parseLinkedInRecommendations(body.rawText);

    if (!entries.length) {
      return NextResponse.json({
        error: "No LinkedIn recommendations were found. Paste the recommender name, headline, date/relationship line, and recommendation text.",
      }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      include: { profile: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (!user?.profile) {
      return NextResponse.json({ error: "A candidate profile is required before importing LinkedIn recommendations." }, { status: 400 });
    }

    const existingEvidence = await prisma.candidateEvidence.findMany({
      where: {
        candidateProfileId: user.profile.id,
        sourceType: "LINKEDIN",
        sourceRef: { in: entries.map((entry) => entry.sourceRef) },
      },
      select: { id: true, sourceRef: true },
    });
    const existingBySourceRef = new Map(existingEvidence.map((item) => [item.sourceRef, item.id]));

    if (body.mode === "preview") {
      return NextResponse.json({
        entries: entries.map((entry) => serializeEntry(entry, existingBySourceRef.get(entry.sourceRef) ?? null)),
        createdEvidenceCount: 0,
        duplicateCount: existingEvidence.length,
        proposedBulletCount: 0,
      });
    }

    let createdEvidenceCount = 0;
    let proposedBulletCount = 0;
    const importedEntries = [];

    for (const entry of entries) {
      const existingId = existingBySourceRef.get(entry.sourceRef);
      if (existingId) {
        importedEntries.push(serializeEntry(entry, existingId));
        continue;
      }

      const evidence = await upsertEvidence(buildRecommendationEvidenceDraft(user.profile.id, entry));
      createdEvidenceCount += 1;
      importedEntries.push(serializeEntry(entry, evidence.id));

      if (body.createProposedBullets) {
        for (const bullet of buildRecommendationBulletDrafts(entry)) {
          await prisma.experienceBullet.create({
            data: {
              userProfileId: user.profile.id,
              company: bullet.company,
              role: bullet.role,
              category: bullet.category,
              text: bullet.text,
              keywords: bullet.keywords,
              metrics: bullet.metrics,
              sourceText: bullet.sourceText,
              truthLevel: bullet.truthLevel,
            },
          });
          proposedBulletCount += 1;
        }
      }
    }

    return NextResponse.json({
      entries: importedEntries,
      createdEvidenceCount,
      duplicateCount: existingEvidence.length,
      proposedBulletCount,
      message: `Imported ${createdEvidenceCount} LinkedIn recommendation${createdEvidenceCount === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function serializeEntry(entry: ReturnType<typeof parseLinkedInRecommendations>[number], evidenceId: string | null) {
  return {
    recommenderName: entry.recommenderName,
    recommenderHeadline: entry.recommenderHeadline,
    date: entry.date,
    relationship: entry.relationship,
    body: entry.body,
    sourceRef: entry.sourceRef,
    themes: entry.themes,
    existingEvidenceId: evidenceId,
    duplicate: Boolean(evidenceId),
  };
}
