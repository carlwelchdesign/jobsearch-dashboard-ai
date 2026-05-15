import { simpleParser, type ParsedMail } from "mailparser";
import { ImapFlow } from "imapflow";
import { ingestJobEmail, type EmailMessageIngestInput } from "@/lib/email-response-agent";
import { prisma } from "@/lib/prisma";

export type ImapEmailSyncConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  mailbox: string;
  limit: number;
  sinceDays: number;
  unseenOnly: boolean;
};

export type ImapSyncResult = {
  ok: true;
  provider: "imap";
  mailbox: string;
  scanned: number;
  ingested: number;
  skipped: number;
  messages: Array<{
    providerMessageId: string;
    subject: string;
    classification: string;
    matchedApplicationId: string | null;
    matchedJobPostingId: string | null;
  }>;
};

export function imapConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ImapEmailSyncConfig {
  const host = env.JOB_EMAIL_IMAP_HOST?.trim();
  const user = env.JOB_EMAIL_IMAP_USER?.trim();
  const pass = env.JOB_EMAIL_IMAP_PASSWORD?.trim();
  if (!host || !user || !pass) {
    throw new Error("Set JOB_EMAIL_IMAP_HOST, JOB_EMAIL_IMAP_USER, and JOB_EMAIL_IMAP_PASSWORD before syncing email.");
  }

  return {
    host,
    port: Number(env.JOB_EMAIL_IMAP_PORT ?? 993),
    secure: env.JOB_EMAIL_IMAP_SECURE !== "false",
    user,
    pass,
    mailbox: env.JOB_EMAIL_IMAP_MAILBOX?.trim() || "INBOX",
    limit: clampInteger(Number(env.JOB_EMAIL_IMAP_LIMIT ?? 25), 1, 100),
    sinceDays: clampInteger(Number(env.JOB_EMAIL_IMAP_SINCE_DAYS ?? 14), 1, 120),
    unseenOnly: env.JOB_EMAIL_IMAP_UNSEEN_ONLY === "true",
  };
}

export async function syncImapEmail(config = imapConfigFromEnv()): Promise<ImapSyncResult> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user exists. Run seed first.");

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    logger: false,
  });
  const since = new Date(Date.now() - config.sinceDays * 24 * 60 * 60 * 1000);
  const messages: ImapSyncResult["messages"] = [];
  let scanned = 0;
  let skipped = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.mailbox);
    try {
      const searchCriteria = config.unseenOnly ? { since, seen: false } : { since };
      const searchResult = await client.search(searchCriteria);
      const uids = Array.isArray(searchResult) ? searchResult : [];
      const targetUids = uids.slice(-config.limit);
      scanned = targetUids.length;

      for await (const message of client.fetch(targetUids, { uid: true, envelope: true, source: true }, { uid: true })) {
        if (!message.source) {
          skipped += 1;
          continue;
        }
        const parsed = await simpleParser(message.source);
        const input = buildEmailIngestInputFromParsed({
          userId: user.id,
          uid: message.uid,
          parsed,
          envelopeMessageId: message.envelope?.messageId,
        });
        const result = await ingestJobEmail(input);
        messages.push({
          providerMessageId: input.providerMessageId,
          subject: input.subject,
          classification: result.classification.classification,
          matchedApplicationId: result.match.applicationId,
          matchedJobPostingId: result.match.jobPostingId,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return {
    ok: true,
    provider: "imap",
    mailbox: config.mailbox,
    scanned,
    ingested: messages.length,
    skipped,
    messages,
  };
}

export function buildEmailIngestInputFromParsed(input: {
  userId: string;
  uid: number;
  parsed: ParsedMail;
  envelopeMessageId?: string | false;
}): EmailMessageIngestInput {
  const messageId = typeof input.parsed.messageId === "string" && input.parsed.messageId.trim()
    ? input.parsed.messageId.trim()
    : typeof input.envelopeMessageId === "string" && input.envelopeMessageId.trim()
    ? input.envelopeMessageId.trim()
    : `uid:${input.uid}`;

  return {
    userId: input.userId,
    provider: "imap",
    providerMessageId: messageId,
    threadId: input.parsed.inReplyTo ?? input.parsed.references?.[0] ?? null,
    from: input.parsed.from?.text ?? "unknown sender",
    to: addressTextArray(input.parsed.to),
    subject: input.parsed.subject?.trim() || "(no subject)",
    receivedAt: input.parsed.date ?? new Date(),
    snippet: snippetFromText(input.parsed.text),
    bodyText: input.parsed.text ?? input.parsed.html?.toString() ?? null,
    rawMetadataJson: {
      uid: input.uid,
      messageId,
      inReplyTo: input.parsed.inReplyTo ?? null,
      references: input.parsed.references ?? [],
    },
  };
}

function addressTextArray(value: ParsedMail["to"]) {
  if (!value) return [];
  const text = Array.isArray(value) ? value.map((item) => item.text).join(", ") : value.text;
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

function snippetFromText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim().slice(0, 240) ?? "";
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
