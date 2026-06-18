import { JoleneMessageRole, Prisma } from "@prisma/client";
import { executeJoleneAction, type JoleneClientAction } from "@/lib/jolene/actions";
import { validateJoleneAnswer } from "@/lib/jolene/answer-guard";
import { buildJolenePageContext } from "@/lib/jolene/context";
import { buildJoleneGlobalContext, retrieveJoleneKnowledge } from "@/lib/jolene/knowledge";
import { generateJoleneReply } from "@/lib/jolene/respond";
import { executeJoleneStateQuery } from "@/lib/jolene/state-query";
import { prisma } from "@/lib/prisma";
import { captureSkillFeedback, isSkillFeedbackIntent } from "@/lib/skills/learning";

export const GLOBAL_JOLENE_CONTEXT_PATH = "/__jolene_global";

export type JoleneMessageSource = {
  kind: "slack";
  channelId: string;
  messageTs: string;
  threadTs: string;
  slackUserId: string;
  rawText?: string;
};

export type JoleneChatPayload = {
  conversation: {
    id: string;
    contextPath: string;
    title: string;
  };
  messages: SerializedJoleneMessage[];
  clientAction: JoleneClientAction | null;
  context: {
    routeType: string;
    summary: string;
    suggestedActions: Array<{
      label: string;
      href?: string;
      method?: string;
      description: string;
    }>;
  };
};

export type SerializedJoleneMessage = {
  id: string;
  role: JoleneMessageRole;
  content: string;
  actionJson: Prisma.JsonValue;
  createdAt: string;
};

export async function loadJoleneConversation(input: {
  userId: string;
  contextPath: string;
}): Promise<Omit<JoleneChatPayload, "clientAction">> {
  const contextPath = normalizeContextPath(input.contextPath);
  const conversation = await getOrCreateConversation(input.userId, GLOBAL_JOLENE_CONTEXT_PATH);
  const messages = await prisma.joleneMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 80,
  });
  const context = await buildJolenePageContext(contextPath);

  return {
    conversation: {
      id: conversation.id,
      contextPath,
      title: conversation.title ?? titleFromPath(GLOBAL_JOLENE_CONTEXT_PATH),
    },
    context: {
      routeType: context.routeType,
      summary: context.summary,
      suggestedActions: context.suggestedActions,
    },
    messages: messages.map((message) => serializeMessage(message)),
  };
}

export async function sendJoleneMessage(input: {
  userId: string;
  message: string;
  contextPath?: string;
  source?: JoleneMessageSource;
}): Promise<JoleneChatPayload> {
  const contextPath = normalizeContextPath(input.contextPath ?? "/dashboard");
  const conversation = await getOrCreateConversation(input.userId, GLOBAL_JOLENE_CONTEXT_PATH);
  const context = await buildJolenePageContext(contextPath);

  const userMessage = await prisma.joleneMessage.create({
    data: {
      conversationId: conversation.id,
      role: JoleneMessageRole.USER,
      content: input.message,
      contextJson: toJsonInput({ source: input.source ?? null }),
      actionJson: toJsonInput({ source: input.source ?? null }),
    },
  });

  let actionResult = {
    handled: false,
  } as Awaited<ReturnType<typeof executeJoleneAction>>;
  let reply: string | undefined;
  let fallbackGlobalContext: Awaited<ReturnType<typeof buildJoleneGlobalContext>> | null = null;
  let fallbackRetrievedItems: Awaited<ReturnType<typeof retrieveJoleneKnowledge>> = [];

  if (isSkillFeedbackIntent(input.message)) {
    const feedback = await captureSkillFeedback({
      userId: input.userId,
      message: input.message,
      contextPath,
      joleneMessageId: userMessage.id,
      contextData: context.data,
    });
    actionResult = {
      handled: true,
      reply: [
        `I recorded that feedback for ${feedback.skillId.replace(/_/g, " ")}.`,
        feedback.autoApplied
          ? `${feedback.autoApplied} low-risk learning update${feedback.autoApplied === 1 ? "" : "s"} auto-applied.`
          : "No low-risk update was auto-applied.",
        feedback.pending
          ? `${feedback.pending} higher-risk proposal${feedback.pending === 1 ? "" : "s"} needs review in Settings.`
          : "No higher-risk proposal is waiting.",
      ].join(" "),
      actionJson: {
        action: "capture_skill_feedback",
        feedbackId: feedback.feedbackId,
        skillId: feedback.skillId,
        autoApplied: feedback.autoApplied,
        pending: feedback.pending,
        adjustments: feedback.adjustments,
      },
      clientAction: { type: "refresh" },
    };
    reply = actionResult.reply;
  } else {
    actionResult = await executeJoleneAction(input.message, { userId: input.userId });
    reply = actionResult.reply;
  }

  if (!actionResult.handled) {
    const history = await prisma.joleneMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 40,
    });
    [fallbackGlobalContext, fallbackRetrievedItems] = await Promise.all([
      buildJoleneGlobalContext(input.userId),
      retrieveJoleneKnowledge(input.message, input.userId),
    ]);

    reply = await generateJoleneReply({
      message: input.message,
      context,
      globalContext: fallbackGlobalContext,
      retrievedItems: fallbackRetrievedItems,
      history: history.map((message) => ({ role: message.role, content: message.content })),
    });
  }

  let assistantActionJson = {
    suggestedActions: context.suggestedActions,
    checkedSources: fallbackGlobalContext?.checkedSources ?? actionResult.actionJson?.checkedSources ?? [],
    retrievedItems: fallbackRetrievedItems.length ? fallbackRetrievedItems : actionResult.actionJson?.retrievedItems ?? [],
    requiresConfirmation: actionResult.requiresConfirmation ?? false,
    plannedActions: actionResult.plannedActions ?? [],
    executedActions: actionResult.executedActions ?? [],
    source: input.source ?? null,
    ...(actionResult.actionJson ?? {}),
  } as Record<string, unknown>;
  const answerGuard = validateJoleneAnswer({
    message: input.message,
    reply,
    actionJson: assistantActionJson,
  });
  if (!answerGuard.ok) {
    const rerouted = await executeJoleneStateQuery(input.message, { userId: input.userId });
    if (rerouted.handled && rerouted.reply) {
      reply = rerouted.reply;
      actionResult = {
        handled: true,
        reply,
        actionJson: {
          answerGuard: { rerouted: true, reason: answerGuard.reason },
          ...(rerouted.actionJson ?? {}),
        },
        clientAction: rerouted.clientAction,
      };
	      assistantActionJson = {
	        suggestedActions: context.suggestedActions,
	        checkedSources: rerouted.actionJson?.checkedSources ?? [],
	        retrievedItems: [],
	        requiresConfirmation: false,
        plannedActions: [],
        executedActions: [],
        source: input.source ?? null,
        answerGuard: { rerouted: true, reason: answerGuard.reason },
        ...(rerouted.actionJson ?? {}),
      };
    } else {
      reply = "I caught a routing mismatch before sending that answer. Ask the question again with the app area you want me to inspect, and I will answer from local app state.";
      assistantActionJson = {
        suggestedActions: context.suggestedActions,
        checkedSources: [],
        retrievedItems: [],
        requiresConfirmation: false,
        plannedActions: [],
        executedActions: [],
        source: input.source ?? null,
        action: "jolene_answer_guard",
        answerGuard: { blocked: true, reason: answerGuard.reason },
      };
      actionResult = {
        handled: true,
        reply,
        actionJson: assistantActionJson,
      };
    }
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
        globalContext: fallbackGlobalContext,
        source: input.source ?? null,
      }),
      actionJson: toJsonInput({
        ...assistantActionJson,
      }),
    },
  });

  return {
    conversation: {
      id: conversation.id,
      contextPath,
      title: conversation.title ?? titleFromPath(GLOBAL_JOLENE_CONTEXT_PATH),
    },
    messages: [serializeMessage(userMessage), serializeMessage(assistantMessage)],
    clientAction: actionResult.clientAction ?? null,
    context: {
      routeType: context.routeType,
      summary: context.summary,
      suggestedActions: context.suggestedActions,
    },
  };
}

export async function recordJoleneExchange(input: {
  userId: string;
  userMessage: string;
  assistantMessage: string;
  contextPath?: string;
  source?: JoleneMessageSource;
  actionJson?: Record<string, unknown>;
  clientAction?: JoleneClientAction | null;
}): Promise<JoleneChatPayload> {
  const contextPath = normalizeContextPath(input.contextPath ?? "/dashboard");
  const conversation = await getOrCreateConversation(input.userId, GLOBAL_JOLENE_CONTEXT_PATH);
  const context = await buildJolenePageContext(contextPath);

  const [userMessage, assistantMessage] = await prisma.$transaction([
    prisma.joleneMessage.create({
      data: {
        conversationId: conversation.id,
        role: JoleneMessageRole.USER,
        content: input.userMessage,
        contextJson: toJsonInput({ source: input.source ?? null }),
        actionJson: toJsonInput({ source: input.source ?? null }),
      },
    }),
    prisma.joleneMessage.create({
      data: {
        conversationId: conversation.id,
        role: JoleneMessageRole.ASSISTANT,
        content: input.assistantMessage,
        contextJson: toJsonInput({
          routeType: context.routeType,
          contextPath: context.contextPath,
          summary: context.summary,
          source: input.source ?? null,
        }),
        actionJson: toJsonInput({
          source: input.source ?? null,
          ...(input.actionJson ?? {}),
        }),
      },
    }),
  ]);

  return {
    conversation: {
      id: conversation.id,
      contextPath,
      title: conversation.title ?? titleFromPath(GLOBAL_JOLENE_CONTEXT_PATH),
    },
    messages: [serializeMessage(userMessage), serializeMessage(assistantMessage)],
    clientAction: input.clientAction ?? null,
    context: {
      routeType: context.routeType,
      summary: context.summary,
      suggestedActions: context.suggestedActions,
    },
  };
}

export function serializeMessage(message: {
  id: string;
  role: JoleneMessageRole;
  content: string;
  actionJson?: Prisma.JsonValue;
  createdAt: Date;
}): SerializedJoleneMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    actionJson: message.actionJson ?? {},
    createdAt: message.createdAt.toISOString(),
  };
}

export function normalizeContextPath(contextPath: string) {
  try {
    const url = new URL(contextPath, "http://local");
    return url.pathname || "/dashboard";
  } catch {
    return contextPath.startsWith("/") ? contextPath.split("?")[0] || "/dashboard" : "/dashboard";
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
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
