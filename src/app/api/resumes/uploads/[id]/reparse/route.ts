import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/api";
import { parseUploadedResume } from "@/lib/ai/resume";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const upload = await prisma.resumeUpload.findUnique({
      where: { id: params.id },
      select: { id: true, extractedText: true },
    });

    if (!upload) return NextResponse.json({ error: "Resume upload not found." }, { status: 404 });

    const parsedJson = await parseUploadedResume(upload.extractedText);
    const updatedUpload = await prisma.resumeUpload.update({
      where: { id: upload.id },
      data: {
        parsedJson: parsedJson as Prisma.InputJsonValue,
        parsingStatus: "needs_review",
      },
    });

    return NextResponse.json({ upload: updatedUpload, parsedJson });
  } catch (error) {
    return apiError(error, 400);
  }
}
