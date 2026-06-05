export type FallbackItem = { id: string; message: string };

const FALLBACK_DEFS: Record<string, string> = {
  openai:
    "AI features are in fallback mode — job scores use keyword matching, resume tailoring uses templates, and Jolene gives generic answers instead of reading your profile.",
  brave:
    "The Search Query Backlog source has no provider — jobs from Workday, Wellfound, YC, and 100+ platforms are not being searched.",
  email_sync:
    "No email inbox is connected — application outcomes won't update automatically when recruiter replies or rejections arrive.",
  playwright:
    "The local browser assistant is not installed — Apply Sprint cannot auto-fill application forms.",
  notifications:
    "No notification provider is configured — you won't be alerted when strong matches are found or the assistant needs input.",
};

export type FallbackOptions = {
  /** Pass true if DB-level OAuth email connections are active (overrides env-only check) */
  anyEmailSyncConnected?: boolean;
  /** Pass true if DB-level notification settings (pushover/email) are configured and enabled */
  anyNotificationConfigured?: boolean;
};

export function getServiceFallbacks(ids: string[], opts?: FallbackOptions): FallbackItem[] {
  const items: FallbackItem[] = [];

  for (const id of ids) {
    const message = FALLBACK_DEFS[id];
    if (!message) continue;

    let missing = false;

    if (id === "openai") {
      missing = !process.env.OPENAI_API_KEY?.trim();
    } else if (id === "brave") {
      missing = !process.env.BRAVE_SEARCH_API_KEY?.trim();
    } else if (id === "email_sync") {
      const imapConfigured =
        Boolean(process.env.JOB_EMAIL_IMAP_HOST?.trim()) &&
        Boolean(process.env.JOB_EMAIL_IMAP_USER?.trim()) &&
        Boolean(process.env.JOB_EMAIL_IMAP_PASSWORD?.trim());
      const gmailConfigured =
        Boolean(process.env.GMAIL_OAUTH_CLIENT_ID?.trim()) &&
        Boolean(process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim());
      const outlookConfigured =
        Boolean(process.env.OUTLOOK_OAUTH_CLIENT_ID?.trim()) &&
        Boolean(process.env.OUTLOOK_OAUTH_CLIENT_SECRET?.trim());
      missing =
        !imapConfigured &&
        !gmailConfigured &&
        !outlookConfigured &&
        !opts?.anyEmailSyncConnected;
    } else if (id === "playwright") {
      missing = !process.env.ENABLE_LOCAL_ASSISTANT?.trim();
    } else if (id === "notifications") {
      const pushoverEnv =
        Boolean(process.env.PUSHOVER_USER_KEY?.trim()) &&
        Boolean(process.env.PUSHOVER_APP_TOKEN?.trim());
      const resend = Boolean(process.env.RESEND_API_KEY?.trim());
      const postmark = Boolean(process.env.POSTMARK_SERVER_TOKEN?.trim());
      missing =
        !pushoverEnv && !resend && !postmark && !opts?.anyNotificationConfigured;
    }

    if (missing) {
      items.push({ id, message });
    }
  }

  return items;
}
