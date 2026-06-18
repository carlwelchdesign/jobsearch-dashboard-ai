import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Slack app manifest", () => {
  it("documents Home tab, event subscription, and expanded /jso usage", () => {
    const manifest = readFileSync(resolve(process.cwd(), "config/slack-app-manifest.example.yml"), "utf8");

    expect(manifest).toContain("app_home:");
    expect(manifest).toContain("home_tab_enabled: true");
    expect(manifest).toContain("app_home_opened");
    expect(manifest).toContain("message.channels");
    expect(manifest).toContain("channels:history");
    expect(manifest).toContain("opportunity <id>");
    expect(manifest).toContain("coach summary");
    expect(manifest).toContain("run search-team");
    expect(manifest).toContain("commands");
    expect(manifest).toContain("chat:write");
  });
});
