export type SlackConfig = {
  botToken: string;
  appToken: string;
  signingSecret: string;
  opsChannelId: string;
  approvalsChannelId: string;
  decisionLogChannelId: string | null;
  joleneChannelId: string | null;
  appBaseUrl: string;
  allowedUserIds: string[];
  coachUserIds: string[];
};

export type SlackConfigResult =
  | { configured: true; config: SlackConfig }
  | { configured: false; missing: string[] };

const DEFAULT_SIGNING_SECRET = "job-search-os-socket-mode";

type SlackEnv = Record<string, string | undefined>;

export function getSlackConfig(env: SlackEnv = process.env): SlackConfigResult {
  const botToken = normalize(env.SLACK_BOT_TOKEN);
  const appToken = normalize(env.SLACK_APP_TOKEN);
  const opsChannelId = normalize(env.SLACK_OPS_CHANNEL_ID);
  const approvalsChannelId = normalize(env.SLACK_APPROVALS_CHANNEL_ID);
  const appBaseUrl = normalize(env.NEXT_PUBLIC_APP_URL) ?? normalize(env.JOB_SEARCH_OS_APP_URL);

  const missing: string[] = [];
  if (!botToken) missing.push("SLACK_BOT_TOKEN");
  if (!appToken) missing.push("SLACK_APP_TOKEN");
  if (!opsChannelId) missing.push("SLACK_OPS_CHANNEL_ID");
  if (!approvalsChannelId) missing.push("SLACK_APPROVALS_CHANNEL_ID");
  if (!appBaseUrl) missing.push("NEXT_PUBLIC_APP_URL");

  if (missing.length || !botToken || !appToken || !opsChannelId || !approvalsChannelId || !appBaseUrl) {
    return { configured: false, missing };
  }

  return {
    configured: true,
    config: {
      botToken,
      appToken,
      opsChannelId,
      approvalsChannelId,
      appBaseUrl: trimTrailingSlash(appBaseUrl),
      signingSecret: normalize(env.SLACK_SIGNING_SECRET) ?? DEFAULT_SIGNING_SECRET,
      decisionLogChannelId: normalize(env.SLACK_DECISION_LOG_CHANNEL_ID) ?? null,
      joleneChannelId: normalize(env.SLACK_OPS_JOLENE_ID) ?? null,
      allowedUserIds: splitCsv(env.SLACK_ALLOWED_USER_IDS),
      coachUserIds: splitCsv(env.SLACK_COACH_USER_IDS),
    },
  };
}

export function requireSlackConfig(env: SlackEnv = process.env): SlackConfig {
  const result = getSlackConfig(env);
  if (result.configured) return result.config;
  throw new Error(`Slack is not configured. Missing: ${result.missing.join(", ")}.`);
}

export function isSlackUserAllowed(slackUserId: string | null | undefined, config: Pick<SlackConfig, "allowedUserIds">) {
  if (!config.allowedUserIds.length) return true;
  return Boolean(slackUserId && config.allowedUserIds.includes(slackUserId));
}

export function isSlackCoachUser(slackUserId: string | null | undefined, config: Pick<SlackConfig, "coachUserIds">) {
  return Boolean(slackUserId && config.coachUserIds.includes(slackUserId));
}

function normalize(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function splitCsv(value: string | null | undefined) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}
