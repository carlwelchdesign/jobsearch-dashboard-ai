import type { AgentUserRequest, AgentUserRequestStatus, AgentUserRequestType, Prisma } from "@prisma/client";
import { sendNotification } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

export type CreateAgentUserRequestInput = {
  userId: string;
  type: AgentUserRequestType;
  question: string;
  agentRunId?: string | null;
  applicationId?: string | null;
  jobPostingId?: string | null;
  contextJson?: Prisma.InputJsonValue;
};

export type ResolveAgentUserRequestInput = {
  id: string;
  status?: Extract<AgentUserRequestStatus, "ANSWERED" | "DISMISSED" | "RESOLVED">;
  answer?: string | null;
};

export function buildAgentUserRequestData(input: CreateAgentUserRequestInput): Prisma.AgentUserRequestUncheckedCreateInput {
  return {
    userId: input.userId,
    agentRunId: input.agentRunId ?? null,
    applicationId: input.applicationId ?? null,
    jobPostingId: input.jobPostingId ?? null,
    type: input.type,
    status: "OPEN",
    question: input.question.trim(),
    contextJson: input.contextJson ?? {},
  };
}

export async function createAgentUserRequest(input: CreateAgentUserRequestInput) {
  const data = buildAgentUserRequestData(input);
  if (!data.question) throw new Error("Agent user request question is required.");

  const request = await prisma.agentUserRequest.create({ data });
  await notifyAgentUserRequest(request).catch(() => null);
  return request;
}

export async function notifyAgentUserRequest(request: AgentUserRequest) {
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    include: { notificationSettings: true },
  });
  if (!user) return [];

  const settings = user.notificationSettings ?? await prisma.notificationSettings.create({
    data: {
      userId: user.id,
      emailAddress: user.email,
    },
  });
  const notification = buildAgentUserRequestNotification(request);

  return sendNotification({
    user,
    settings,
    subject: notification.subject,
    body: notification.body,
    payload: {
      source: "agent_user_request",
      requestId: request.id,
      requestType: request.type,
      applicationId: request.applicationId,
      jobPostingId: request.jobPostingId,
      href: notification.href,
    },
  });
}

export function buildAgentUserRequestNotification(request: Pick<AgentUserRequest, "id" | "type" | "question" | "applicationId" | "jobPostingId">) {
  const href = agentUserRequestHref(request);
  return {
    subject: `Job Search OS needs input: ${agentUserRequestTypeLabel(request.type)}`,
    body: [
      request.question,
      "",
      `Open: ${href}`,
      "The agent is paused until this is resolved.",
    ].join("\n"),
    href,
  };
}

export async function listOpenAgentUserRequests(limit = 20) {
  return prisma.agentUserRequest.findMany({
    where: { status: "OPEN" },
    include: {
      application: {
        include: {
          jobPosting: { select: { company: true, title: true } },
        },
      },
      jobPosting: { select: { company: true, title: true } },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

export async function resolveAgentUserRequest(input: ResolveAgentUserRequestInput) {
  const request = await prisma.agentUserRequest.findUnique({ where: { id: input.id } });
  if (!request) throw new Error("Agent user request not found.");
  if (request.status !== "OPEN") throw new Error("Agent user request is already closed.");

  const status = input.status ?? (input.answer?.trim() ? "ANSWERED" : "RESOLVED");
  const answer = input.answer?.trim() || null;
  const resolvedAt = new Date();

  const resolved = await prisma.agentUserRequest.update({
    where: { id: input.id },
    data: {
      status,
      answer,
      resolvedAt,
    },
  });

  if (request.applicationId) {
    await prisma.applicationEvent.create({
      data: {
        applicationId: request.applicationId,
        type: "note_added",
        payload: buildAgentUserRequestResolutionEventPayload({
          requestId: request.id,
          requestType: request.type,
          question: request.question,
          status,
          answerSaved: Boolean(answer),
          resolvedAt,
        }),
      },
    });
  }

  if (request.type === "UNKNOWN_ANSWER" && answer) {
    const { resumeApplicationAssistantWorkflowWithRequestAnswer } = await import("@/lib/applications/assistant-workflow");
    await resumeApplicationAssistantWorkflowWithRequestAnswer({
      requestId: request.id,
      answer,
    }).catch(() => null);
  }

  return resolved;
}

export function buildAgentUserRequestResolutionEventPayload(input: {
  requestId: string;
  requestType: AgentUserRequestType;
  question: string;
  status: Extract<AgentUserRequestStatus, "ANSWERED" | "DISMISSED" | "RESOLVED">;
  answerSaved: boolean;
  resolvedAt: Date;
}): Prisma.InputJsonValue {
  return {
    source: "agent_user_request",
    requestId: input.requestId,
    requestType: input.requestType,
    question: input.question,
    status: input.status,
    answerSaved: input.answerSaved,
    resolvedAt: input.resolvedAt.toISOString(),
  };
}

export function agentUserRequestHref(request: Pick<AgentUserRequest, "applicationId" | "jobPostingId">) {
  if (request.applicationId) return `/applications/${request.applicationId}`;
  if (request.jobPostingId) return `/jobs/${request.jobPostingId}`;
  return "/dashboard";
}

export function agentUserRequestTypeLabel(type: AgentUserRequestType) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
