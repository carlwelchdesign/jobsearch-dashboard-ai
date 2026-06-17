import { describe, expect, it } from "vitest";
import { getSlackConfig, isSlackUserAllowed, requireSlackConfig } from "@/lib/slack/config";

describe("Slack config", () => {
  it("reports missing required Socket Mode env vars", () => {
    const result = getSlackConfig({});

    expect(result).toEqual({
      configured: false,
      missing: [
        "SLACK_BOT_TOKEN",
        "SLACK_APP_TOKEN",
        "SLACK_OPS_CHANNEL_ID",
        "SLACK_APPROVALS_CHANNEL_ID",
        "NEXT_PUBLIC_APP_URL",
      ],
    });
  });

  it("builds config with trimmed app URL and allowed user ids", () => {
    const result = getSlackConfig({
      SLACK_BOT_TOKEN: " xoxb-token ",
      SLACK_APP_TOKEN: "xapp-token",
      SLACK_OPS_CHANNEL_ID: "COPS",
      SLACK_APPROVALS_CHANNEL_ID: "CAPPROVALS",
      SLACK_DECISION_LOG_CHANNEL_ID: "CDECISIONS",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000/",
      SLACK_ALLOWED_USER_IDS: "U1, U2",
    });

    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.config.appBaseUrl).toBe("http://localhost:3000");
      expect(result.config.allowedUserIds).toEqual(["U1", "U2"]);
      expect(isSlackUserAllowed("U2", result.config)).toBe(true);
      expect(isSlackUserAllowed("U3", result.config)).toBe(false);
    }
  });

  it("throws a concise setup error when required env vars are missing", () => {
    expect(() => requireSlackConfig({ SLACK_BOT_TOKEN: "xoxb-token" })).toThrow("Missing: SLACK_APP_TOKEN");
  });
});
