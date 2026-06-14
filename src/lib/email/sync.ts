import { imapConfigFromEnv, syncImapEmail, type ImapSyncResult } from "@/lib/email/imap-sync";
import { buildEmailWatchlistFromApplications, type EmailApplicationWatch } from "@/lib/email/application-watchlist";
import { syncGmailEmail, type GmailSyncResult } from "@/lib/email/gmail-sync";
import { prisma } from "@/lib/prisma";

export type EmailSyncResult = {
  ok: true;
  scanned: number;
  ingested: number;
  skipped: number;
  providers: Array<ImapSyncResult | GmailSyncResult | { ok: false; provider: "imap" | "gmail" | "outlook"; skipped: true; reason: string }>;
  watchlist: EmailApplicationWatch[];
  receivedConfirmations: EmailReceivedConfirmation[];
};

export type EmailReceivedConfirmation = {
  applicationId: string;
  company: string;
  title: string;
  subject: string;
  from: string;
  receivedAt: Date;
};

export async function syncJobResponseEmail(input: { limit?: number; sinceDays?: number; includeImap?: boolean; includeGmail?: boolean; targeted?: boolean } = {}): Promise<EmailSyncResult> {
  const providers: EmailSyncResult["providers"] = [];
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  const watchlist = user && input.targeted !== false
    ? await buildEmailWatchlistFromApplications(user)
    : [];

  if (input.includeImap ?? imapEnvConfigured()) {
    try {
      providers.push(await syncImapEmail({
        ...imapConfigFromEnv(),
        ...(input.limit ? { limit: input.limit } : {}),
        ...(input.sinceDays ? { sinceDays: input.sinceDays } : {}),
      }));
    } catch (error) {
      providers.push({ ok: false, provider: "imap", skipped: true, reason: error instanceof Error ? error.message : "IMAP sync failed." });
    }
  }

  if (input.includeGmail ?? true) {
    const gmailConnection = user
      ? await prisma.emailOAuthConnection.findUnique({
          where: { userId_provider: { userId: user.id, provider: "gmail" } },
        })
      : null;

    if (user && gmailConnection?.status === "CONNECTED") {
      try {
        const broadRecentQuery = `newer_than:${input.sinceDays ?? Number(process.env.JOB_EMAIL_GMAIL_SINCE_DAYS ?? process.env.JOB_EMAIL_SYNC_SINCE_DAYS ?? 14)}d`;
        const queries = uniqueQueries([
          broadRecentQuery,
          ...watchlist.flatMap((item) => item.gmailQueries),
        ]);
        providers.push(await syncGmailEmail({
          user,
          connection: gmailConnection,
          limit: input.limit,
          sinceDays: input.sinceDays,
          queries,
        }));
      } catch (error) {
        providers.push({ ok: false, provider: "gmail", skipped: true, reason: error instanceof Error ? error.message : "Gmail sync failed." });
      }
    } else {
      providers.push({ ok: false, provider: "gmail", skipped: true, reason: "No connected Gmail account." });
    }
  }

  const receivedConfirmations = user && watchlist.length
    ? await listReceivedConfirmations(watchlist.map((item) => item.applicationId))
    : [];

  return {
    ok: true,
    scanned: providers.reduce((total, provider) => total + ("scanned" in provider ? provider.scanned : 0), 0),
    ingested: providers.reduce((total, provider) => total + ("ingested" in provider ? provider.ingested : 0), 0),
    skipped: providers.reduce((total, provider) => total + ("skipped" in provider && typeof provider.skipped === "number" ? provider.skipped : provider.skipped ? 1 : 0), 0),
    providers,
    watchlist,
    receivedConfirmations,
  };
}

function uniqueQueries(queries: string[]) {
  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}

function imapEnvConfigured() {
  return Boolean(process.env.JOB_EMAIL_IMAP_HOST?.trim() && process.env.JOB_EMAIL_IMAP_USER?.trim() && process.env.JOB_EMAIL_IMAP_PASSWORD?.trim());
}

async function listReceivedConfirmations(applicationIds: string[]): Promise<EmailReceivedConfirmation[]> {
  const rows = await prisma.emailMessageRecord.findMany({
    where: {
      classification: "AUTOMATED_CONFIRMATION",
      matchedApplicationId: { in: applicationIds },
    },
    include: {
      matchedApplication: {
        include: {
          jobPosting: {
            select: {
              company: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: { receivedAt: "desc" },
    take: 100,
  });

  const latestByApplication = new Map<string, EmailReceivedConfirmation>();
  for (const row of rows) {
    if (!row.matchedApplicationId || !row.matchedApplication || latestByApplication.has(row.matchedApplicationId)) continue;
    latestByApplication.set(row.matchedApplicationId, {
      applicationId: row.matchedApplicationId,
      company: row.matchedApplication.jobPosting.company,
      title: row.matchedApplication.jobPosting.title,
      subject: row.subject,
      from: row.from,
      receivedAt: row.receivedAt,
    });
  }

  return Array.from(latestByApplication.values());
}
