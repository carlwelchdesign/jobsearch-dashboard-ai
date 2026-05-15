import { EmailMessageClassification, EmailProvider, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { ingestJobEmail } from "@/lib/email-response-agent";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const emailMessageSchema = z.object({
  provider: z.nativeEnum(EmailProvider).default("manual"),
  providerMessageId: z.string().trim().min(1).optional(),
  threadId: z.string().trim().min(1).nullable().optional(),
  from: z.string().trim().min(1).max(500),
  to: z.array(z.string().trim().min(1).max(500)).default([]),
  subject: z.string().trim().min(1).max(1000),
  receivedAt: z.string().datetime().optional(),
  snippet: z.string().trim().max(2000).optional(),
  bodyText: z.string().trim().max(50000).nullable().optional(),
  rawMetadataJson: z.record(z.unknown()).default({}),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const classificationParam = url.searchParams.get("classification");
    const classification = classificationParam && classificationParam in EmailMessageClassification
      ? (classificationParam as EmailMessageClassification)
      : undefined;
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);

    const messages = await prisma.emailMessageRecord.findMany({
      where: {
        userId: user.id,
        ...(classification ? { classification } : {}),
      },
      orderBy: { receivedAt: "desc" },
      take: limit,
      include: {
        matchedApplication: {
          select: {
            id: true,
            status: true,
          },
        },
        matchedJobPosting: {
          select: {
            id: true,
            company: true,
            title: true,
          },
        },
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function POST(request: Request) {
  try {
    const body = emailMessageSchema.parse(await request.json());
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!user) return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });

    const result = await ingestJobEmail({
      userId: user.id,
      provider: body.provider,
      providerMessageId: body.providerMessageId ?? `manual:${Date.now()}:${body.subject}`,
      threadId: body.threadId,
      from: body.from,
      to: body.to,
      subject: body.subject,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
      snippet: body.snippet,
      bodyText: body.bodyText,
      rawMetadataJson: body.rawMetadataJson as Prisma.InputJsonValue,
    });

    return NextResponse.json({
      email: result.email,
      classification: result.classification,
      match: result.match,
      message: "Email message ingested.",
    }, { status: 201 });
  } catch (error) {
    return apiError(error, 400);
  }
}
