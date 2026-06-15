import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { jsonValue } from "@/lib/agents/linkedin-content-memory";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const maxUploadBytes = 10 * 1024 * 1024;
const uploadMimeTypes: Record<string, { extension: string; mimeType: "image/png" | "image/jpeg" | "image/webp" }> = {
  "image/png": { extension: "png", mimeType: "image/png" },
  "image/jpeg": { extension: "jpg", mimeType: "image/jpeg" },
  "image/webp": { extension: "webp", mimeType: "image/webp" },
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const draft = await prisma.linkedInPostDraft.findUnique({ where: { id: params.id } });
    if (!draft) return NextResponse.json({ error: "LinkedIn draft not found." }, { status: 404 });
    if (["PUBLISHING", "PUBLISHED"].includes(draft.status)) return NextResponse.json({ error: "Published drafts cannot replace visuals." }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Screenshot file is required." }, { status: 400 });
    const uploadType = uploadMimeTypes[file.type];
    if (!uploadType) return NextResponse.json({ error: "Upload a PNG, JPG, or WebP screenshot." }, { status: 400 });
    if (file.size > maxUploadBytes) return NextResponse.json({ error: "Screenshot must be 10MB or smaller." }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const dir = path.join(process.cwd(), "public", "generated", "linkedin-content");
    await mkdir(dir, { recursive: true });
    const filename = `user-upload-${safePathSegment(params.id)}-${Date.now()}.${uploadType.extension}`;
    const filePath = path.join(dir, filename);
    await writeFile(filePath, bytes);

    const label = textField(formData.get("label")) || file.name || "Uploaded LinkedIn screenshot";
    const description = textField(formData.get("description")) || "User uploaded replacement screenshot for this LinkedIn draft.";
    const asset = {
      label,
      path: `/generated/linkedin-content/${filename}`,
      mimeType: uploadType.mimeType,
      description,
      route: `user-upload:${draft.id}`,
      assetType: "screenshot" as const,
      provenance: ["User uploaded replacement screenshot"],
      privacyStatus: "PASS" as const,
      warnings: [],
    };
    const screenshotAssets = Array.isArray(draft.screenshotAssets) ? draft.screenshotAssets : [];
    const updated = await prisma.linkedInPostDraft.update({
      where: { id: draft.id },
      data: {
        screenshotAssets: jsonValue([...screenshotAssets, asset]),
        selectedScreenshots: jsonValue([asset]),
        publishError: null,
      },
    });
    return NextResponse.json({ draft: updated, asset });
  } catch (error) {
    return apiError(error, 400);
  }
}

function textField(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim().slice(0, 180) : "";
}

function safePathSegment(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "draft";
}
