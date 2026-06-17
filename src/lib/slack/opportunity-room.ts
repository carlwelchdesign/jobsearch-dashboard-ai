import { Prisma, type SlackThreadEntityType } from "@prisma/client";
import {
  actions,
  actionValue,
  compactBlocks,
  context,
  header,
  link,
  sanitize,
  section,
  shortDate,
  slackButton,
  SLACK_ACTIONS,
  type SlackMessage,
} from "@/lib/slack/blocks";
import { requireSlackConfig } from "@/lib/slack/config";
import { postSlackMessage, logSlackAction } from "@/lib/slack/post";
import { requireSingleUser } from "@/lib/auth/single-user";
import { prisma } from "@/lib/prisma";

export type OpportunityRoomResult = {
  created: boolean;
  message: SlackMessage;
  channelId: string;
  threadTs: string;
};

type OpportunityRoomData = {
  userId: string;
  entityType: SlackThreadEntityType;
  entityId: string;
  title: string;
  summary: string;
  appHref: string;
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    remoteType: string;
    salary: string;
    applicationUrl: string | null;
  };
  application: {
    id: string;
    status: string;
    resumeReady: boolean;
    coverLetterReady: boolean;
    followUpAt: Date | null;
  } | null;
  match: {
    id: string;
    score: number;
    action: string;
    explanation: string;
    strengths: string[];
    concerns: string[];
  } | null;
  interviewTasks: Array<{ id: string; title: string; detail: string; status: string; priority: number }>;
  outreach: Array<{ id: string; status: string; followUpAt: Date | null; label: string }>;
};

export async function openSlackOpportunityRoom(rawId: string): Promise<OpportunityRoomResult> {
  const [config, user] = [requireSlackConfig(), await requireSingleUser()];
  const data = await resolveOpportunityRoomData(rawId.trim(), user.id, config.appBaseUrl);
  const existing = await prisma.slackThreadLink.findUnique({
    where: { userId_entityType_entityId: { userId: data.userId, entityType: data.entityType, entityId: data.entityId } },
  });

  if (existing) {
    await appendOpportunityRoomUpdate(existing.id, "Slack reused this opportunity room from `/jso opportunity`.", {
      source: "slash_command",
      rawId,
    });
    return {
      created: false,
      channelId: existing.channelId,
      threadTs: existing.threadTs,
      message: buildOpportunityRoomReusedMessage(data, existing.channelId, existing.threadTs),
    };
  }

  const root = buildOpportunityRoomRootMessage(data);
  const post = await postSlackMessage({
    userId: data.userId,
    channel: "ops",
    text: root.text,
    blocks: root.blocks,
    payload: { kind: "opportunity_room_root", entityType: data.entityType, entityId: data.entityId },
  });

  if (post.status === "failed") {
    throw new Error(post.error);
  }
  if (post.status === "skipped" || !post.ts) {
    throw new Error(`Slack opportunity room was not posted: ${post.status === "skipped" ? post.reason : "missing Slack timestamp"}`);
  }

  const linkRecord = await prisma.slackThreadLink.create({
    data: {
      userId: data.userId,
      entityType: data.entityType,
      entityId: data.entityId,
      channelId: post.channelId,
      rootMessageTs: post.ts,
      threadTs: post.ts,
      title: data.title,
      summary: data.summary,
      status: "ACTIVE",
      lastSyncedAt: new Date(),
    },
  });

  await logSlackAction({
    userId: data.userId,
    subject: "Slack created opportunity room",
    body: data.summary,
    status: "executed",
    payload: { entityType: data.entityType, entityId: data.entityId, slackThreadLinkId: linkRecord.id, channelId: post.channelId, threadTs: post.ts },
  });

  await appendOpportunityRoomUpdate(linkRecord.id, decisionPrompt(data), { source: "opportunity_room_created" });

  return {
    created: true,
    channelId: post.channelId,
    threadTs: post.ts,
    message: buildOpportunityRoomCreatedMessage(data, post.channelId, post.ts),
  };
}

export async function appendOpportunityRoomUpdate(
  slackThreadLinkId: string,
  summary: string,
  payload: Record<string, unknown> = {},
) {
  const linkRecord = await prisma.slackThreadLink.findUnique({ where: { id: slackThreadLinkId } });
  if (!linkRecord) throw new Error("Slack opportunity room mapping was not found.");

  const message = {
    text: summary,
    blocks: compactBlocks([
      section(sanitize(summary)),
      context([`Room ${linkRecord.id}`, `Synced ${shortDate(new Date())}`]),
    ]),
  };

  const post = await postSlackMessage({
    userId: linkRecord.userId,
    channel: "ops",
    text: message.text,
    blocks: message.blocks,
    threadTs: linkRecord.threadTs,
    payload: { kind: "opportunity_room_update", slackThreadLinkId, ...payload },
  });

  await prisma.slackThreadLink.update({
    where: { id: slackThreadLinkId },
    data: { lastSyncedAt: new Date(), summary: sanitize(summary) },
  });

  return post;
}

export async function captureSlackThreadReply(input: {
  channelId: string;
  threadTs: string;
  messageTs: string;
  slackUserId: string;
  text: string;
}) {
  const linkRecord = await prisma.slackThreadLink.findFirst({
    where: { channelId: input.channelId, threadTs: input.threadTs, status: "ACTIVE" },
  });
  if (!linkRecord) return { captured: false as const, reason: "thread_not_mapped" };

  await logSlackAction({
    userId: linkRecord.userId,
    subject: "Slack coach note captured",
    body: input.text,
    status: "executed",
    payload: {
      kind: "coach_thread_reply",
      slackThreadLinkId: linkRecord.id,
      slackUserId: input.slackUserId,
      channelId: input.channelId,
      threadTs: input.threadTs,
      messageTs: input.messageTs,
      entityType: linkRecord.entityType,
      entityId: linkRecord.entityId,
    },
  });

  await prisma.slackThreadLink.update({
    where: { id: linkRecord.id },
    data: { lastSyncedAt: new Date() },
  });

  return { captured: true as const, slackThreadLinkId: linkRecord.id };
}

export function buildOpportunityRoomRootMessage(data: OpportunityRoomData): SlackMessage {
  return {
    text: `Opportunity room: ${data.job.company} - ${data.job.title}`,
    blocks: compactBlocks([
      header("Opportunity Room"),
      section(`*${sanitize(data.job.company)} - ${sanitize(data.job.title)}*\n${sanitize(data.summary)}`),
      section([
        `*Location:* ${sanitize(data.job.location ?? "unknown")} (${data.job.remoteType})`,
        `*Salary:* ${sanitize(data.job.salary)}`,
        `*Application:* ${data.application ? data.application.status : "no application yet"}`,
      ].join("\n")),
      data.match ? section([
        `*Match score:* ${data.match.score}`,
        `*Recommendation:* ${sanitize(data.match.action)}`,
        `*Rationale:* ${sanitize(data.match.explanation)}`,
      ].join("\n")) : null,
      data.match?.strengths.length ? section(`*Strong evidence*\n${data.match.strengths.map((item) => `- ${sanitize(item)}`).join("\n")}`) : null,
      data.match?.concerns.length ? section(`*Concerns / missing evidence*\n${data.match.concerns.map((item) => `- ${sanitize(item)}`).join("\n")}`) : null,
      section(`*Materials*\n${materialsLine(data)}`),
      data.interviewTasks.length ? section(`*Interview prep*\n${data.interviewTasks.map((task) => `- ${sanitize(task.title)} (${task.status})`).join("\n")}`) : null,
      data.outreach.length ? section(`*Contacts and follow-ups*\n${data.outreach.map((item) => `- ${sanitize(item.label)} - ${item.status}${item.followUpAt ? ` (${shortDate(item.followUpAt)})` : ""}`).join("\n")}`) : null,
      actions([
        slackButton({
          text: "Open in app",
          actionId: SLACK_ACTIONS.openLink,
          value: actionValue({ kind: "open_link", href: data.appHref }),
          url: data.appHref,
          style: "primary",
        }),
        slackButton({
          text: "Needs evidence",
          actionId: SLACK_ACTIONS.needsEvidence,
          value: actionValue({ kind: "needs_evidence", entityType: entityTypeForPayload(data.entityType), entityId: data.entityId, href: data.appHref, label: data.title }),
        }),
        slackButton({
          text: "Reject",
          actionId: SLACK_ACTIONS.rejectRecommendation,
          value: actionValue({ kind: "reject_recommendation", entityType: entityTypeForPayload(data.entityType), entityId: data.entityId, href: data.appHref, label: data.title }),
          style: "danger",
        }),
        slackButton({
          text: "Add coach note",
          actionId: SLACK_ACTIONS.captureCoachNote,
          value: actionValue({ kind: "capture_coach_note", entityType: entityTypeForPayload(data.entityType), entityId: data.entityId, href: data.appHref, label: data.title }),
        }),
      ]),
      context([link(data.appHref, "Open app record"), `Job ${data.job.id}`]),
    ]),
  };
}

function buildOpportunityRoomCreatedMessage(data: OpportunityRoomData, channelId: string, threadTs: string): SlackMessage {
  return {
    text: "Opportunity room created",
    blocks: compactBlocks([
      header("Opportunity Room Ready"),
      section(`Created a Slack thread for *${sanitize(data.job.company)} - ${sanitize(data.job.title)}* in the ops channel.`),
      context([`Channel ${channelId}`, `Thread ${threadTs}`, link(data.appHref, "Open app record")]),
    ]),
  };
}

function buildOpportunityRoomReusedMessage(data: OpportunityRoomData, channelId: string, threadTs: string): SlackMessage {
  return {
    text: "Opportunity room already exists",
    blocks: compactBlocks([
      header("Opportunity Room Exists"),
      section(`Reused the existing Slack thread for *${sanitize(data.job.company)} - ${sanitize(data.job.title)}*.`),
      context([`Channel ${channelId}`, `Thread ${threadTs}`, link(data.appHref, "Open app record")]),
    ]),
  };
}

async function resolveOpportunityRoomData(rawId: string, userId: string, appBaseUrl: string): Promise<OpportunityRoomData> {
  const application = await prisma.application.findFirst({
    where: { id: rawId, userId },
    include: {
      jobPosting: true,
      jobProfileMatch: true,
      interviewPrepTasks: { orderBy: [{ status: "asc" }, { priority: "asc" }], take: 6 },
    },
  });

  if (application) {
    const outreach = await prisma.recruiterOutreach.findMany({
      where: { userId, jobPostingId: application.jobPostingId },
      include: { contact: { select: { name: true, company: true } } },
      orderBy: { updatedAt: "desc" },
      take: 4,
    });
    return roomDataFromJob({
      userId,
      entityType: "APPLICATION",
      entityId: application.id,
      appBaseUrl,
      job: application.jobPosting,
      application,
      match: application.jobProfileMatch,
      interviewTasks: application.interviewPrepTasks,
      outreach,
    });
  }

  const job = await prisma.jobPosting.findFirst({
    where: { id: rawId },
    include: {
      applications: {
        where: { userId },
        include: { interviewPrepTasks: { orderBy: [{ status: "asc" }, { priority: "asc" }], take: 6 } },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      matches: {
        where: { jobSearchProfile: { userId } },
        orderBy: { overallScore: "desc" },
        take: 1,
      },
      recruiterOutreach: {
        where: { userId },
        include: { contact: { select: { name: true, company: true } } },
        orderBy: { updatedAt: "desc" },
        take: 4,
      },
    },
  });

  if (!job) throw new Error("No job or application was found for that id.");

  const app = job.applications[0] ?? null;
  return roomDataFromJob({
    userId,
    entityType: "JOB",
    entityId: job.id,
    appBaseUrl,
    job,
    application: app,
    match: job.matches[0] ?? null,
    interviewTasks: app?.interviewPrepTasks ?? [],
    outreach: job.recruiterOutreach,
  });
}

function roomDataFromJob(input: {
  userId: string;
  entityType: SlackThreadEntityType;
  entityId: string;
  appBaseUrl: string;
  job: { id: string; title: string; company: string; location: string | null; remoteType: string; salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; applicationUrl: string | null; description: string };
  application: { id: string; status: string; resumeId: string | null; coverLetterId: string | null; followUpAt: Date | null } | null;
  match: { id: string; overallScore: number; recommendedAction: string; aiExplanation: string; strongestMatches: Prisma.JsonValue; concerns: Prisma.JsonValue } | null;
  interviewTasks: Array<{ id: string; title: string; detail: string; status: string; priority: number }>;
  outreach: Array<{ id: string; status: string; followUpAt: Date | null; contact?: { name: string; company: string | null } | null }>;
}): OpportunityRoomData {
  const salary = input.job.salaryMin || input.job.salaryMax
    ? `${input.job.salaryCurrency ?? "USD"} ${input.job.salaryMin ?? "?"}-${input.job.salaryMax ?? "?"}`
    : "not listed";
  const appHref = input.application
    ? `${input.appBaseUrl}/applications/${input.application.id}`
    : `${input.appBaseUrl}/jobs/${input.job.id}`;

  return {
    userId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    title: `${input.job.company} - ${input.job.title}`,
    summary: summarizeJob(input.job.description),
    appHref,
    job: {
      id: input.job.id,
      title: input.job.title,
      company: input.job.company,
      location: input.job.location,
      remoteType: input.job.remoteType,
      salary,
      applicationUrl: input.job.applicationUrl,
    },
    application: input.application ? {
      id: input.application.id,
      status: input.application.status,
      resumeReady: Boolean(input.application.resumeId),
      coverLetterReady: Boolean(input.application.coverLetterId),
      followUpAt: input.application.followUpAt,
    } : null,
    match: input.match ? {
      id: input.match.id,
      score: input.match.overallScore,
      action: input.match.recommendedAction,
      explanation: input.match.aiExplanation,
      strengths: jsonStringArray(input.match.strongestMatches).slice(0, 4),
      concerns: jsonStringArray(input.match.concerns).slice(0, 4),
    } : null,
    interviewTasks: input.interviewTasks.slice(0, 6),
    outreach: input.outreach.map((item) => ({
      id: item.id,
      status: item.status,
      followUpAt: item.followUpAt,
      label: item.contact?.name
        ? `${item.contact.name}${item.contact.company ? ` at ${item.contact.company}` : ""}`
        : "Recruiter follow-up",
    })),
  };
}

function materialsLine(data: OpportunityRoomData) {
  if (!data.application) return "- No application record yet.";
  return [
    `- Resume: ${data.application.resumeReady ? "ready" : "missing"}`,
    `- Cover letter: ${data.application.coverLetterReady ? "ready" : "missing"}`,
    data.application.followUpAt ? `- Follow-up: ${shortDate(data.application.followUpAt)}` : null,
  ].filter(Boolean).join("\n");
}

function decisionPrompt(data: OpportunityRoomData) {
  return [
    `Decision prompt for ${data.title}:`,
    data.match ? `Recommendation: ${data.match.action} at score ${data.match.score}.` : "No match score is attached yet.",
    "Use this thread for evidence summaries, coach comments, and final rationale. Final app decisions still happen in Job Search OS.",
  ].join(" ");
}

function summarizeJob(description: string) {
  const normalized = description.replace(/\s+/g, " ").trim();
  return normalized.length <= 260 ? normalized : `${normalized.slice(0, 259)}...`;
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function entityTypeForPayload(entityType: SlackThreadEntityType) {
  return entityType.toLowerCase() as "job" | "application" | "linkedin_draft" | "interview_prep" | "follow_up" | "search_optimization_run";
}
