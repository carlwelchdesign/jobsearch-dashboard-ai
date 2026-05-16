import { JoleneMessageRole, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { executeJoleneAction } from "@/lib/jolene/actions";
import { buildJolenePageContext } from "@/lib/jolene/context";
import { generateJoleneReply } from "@/lib/jolene/respond";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  contextPath: z.string().trim().min(1).max(500).default("/dashboard"),
});

const GLOBAL_JOLENE_CONTEXT_PATH = "/__jolene_global";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const contextPath = normalizeContextPath(url.searchParams.get("contextPath") ?? "/dashboard");
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

    if (!user) {
      return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    }

    const conversation = await getOrCreateConversation(user.id, GLOBAL_JOLENE_CONTEXT_PATH);
    const messages = await prisma.joleneMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 80,
    });
    const context = await buildJolenePageContext(contextPath);

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        contextPath,
        title: conversation.title,
      },
      context: {
        routeType: context.routeType,
        summary: context.summary,
        suggestedActions: context.suggestedActions,
      },
      messages: messages.map((message) => serializeMessage(message)),
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function POST(request: Request) {
  try {
    const body = messageSchema.parse(await request.json());
    const contextPath = normalizeContextPath(body.contextPath);
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

    if (!user) {
      return NextResponse.json({ error: "No user exists. Run seed first." }, { status: 400 });
    }

    const conversation = await getOrCreateConversation(user.id, GLOBAL_JOLENE_CONTEXT_PATH);
    const context = await buildJolenePageContext(contextPath);

    const userMessage = await prisma.joleneMessage.create({
      data: {
        conversationId: conversation.id,
        role: JoleneMessageRole.USER,
        content: body.message,
        contextJson: {},
        actionJson: {},
      },
    });

    const actionResult = await executeJoleneAction(body.message);
    let reply = actionResult.reply;

    if (!actionResult.handled) {
      const history = await prisma.joleneMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
        take: 40,
      });

      reply = await generateJoleneReply({
        message: body.message,
        context,
        history: history.map((message) => ({ role: message.role, content: message.content })),
      });
    }

    const assistantMessage = await prisma.joleneMessage.create({
      data: {
        conversationId: conversation.id,
        role: JoleneMessageRole.ASSISTANT,
        content: reply ?? "Done.",
        contextJson: toJsonInput({
          routeType: context.routeType,
          contextPath: context.contextPath,
          summary: context.summary,
          data: context.data,
        }),
        actionJson: toJsonInput({
          suggestedActions: context.suggestedActions,
          ...(actionResult.actionJson ?? {}),
        }),
      },
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        contextPath,
        title: conversation.title,
      },
      messages: [serializeMessage(userMessage), serializeMessage(assistantMessage)],
      clientAction: actionResult.clientAction ?? null,
      context: {
        routeType: context.routeType,
        summary: context.summary,
        suggestedActions: context.suggestedActions,
      },
    });
  } catch (error) {
    return apiError(error, 400);
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function getOrCreateConversation(userId: string, contextPath: string) {
  const existing = await prisma.joleneConversation.findFirst({
    where: { userId, contextPath },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) return existing;

  return prisma.joleneConversation.create({
    data: {
      userId,
      contextPath,
      title: titleFromPath(contextPath),
    },
  });
}

function serializeMessage(message: {
  id: string;
  role: JoleneMessageRole;
  content: string;
  createdAt: Date;
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

function normalizeContextPath(contextPath: string) {
  try {
    const url = new URL(contextPath, "http://local");
    return url.pathname || "/dashboard";
  } catch {
    return contextPath.startsWith("/") ? contextPath.split("?")[0] || "/dashboard" : "/dashboard";
  }
}

function titleFromPath(contextPath: string) {
  if (contextPath === GLOBAL_JOLENE_CONTEXT_PATH) return "Jolene";
  if (contextPath === "/" || contextPath === "/dashboard") return "Command Center";
  if (contextPath === "/jobs") return "Jobs";
  if (contextPath.startsWith("/jobs/")) return "Job detail";
  if (contextPath === "/applications/assistant") return "Apply Sprint";
  if (contextPath.startsWith("/applications/")) return "Application detail";
  if (contextPath === "/applications") return "Applications";
  if (contextPath === "/needs-me") return "Needs Me";
  if (contextPath === "/settings") return "Settings";
  return "Jolene";
}
