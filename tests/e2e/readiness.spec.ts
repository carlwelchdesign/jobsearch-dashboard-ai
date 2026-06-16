import { expect, test } from "playwright/test";

const runBrowserChecks = Boolean(process.env.CI || process.env.PLAYWRIGHT_RUN_BROWSER === "1");

test.describe("product coherence readiness cockpit", () => {
  test.skip(!runBrowserChecks, "Browser page checks run in CI or with PLAYWRIGHT_RUN_BROWSER=1; Codex macOS sandbox blocks Chrome launch.");

  test("shows the operating cockpit on the dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByText("Operating cockpit")).toBeVisible();
    await expect(page.getByText("Lifecycle readiness")).toBeVisible();
    await expect(page.getByText("Priority readiness worklist")).toBeVisible();
    await expect(page.getByText("Value proof")).toBeVisible();
    await expect(page.getByText("Active queues")).toBeVisible();
  });

  test("surfaces contextual readiness on lifecycle pages", async ({ page }) => {
    const pages = [
      ["/jobs", "Job review readiness"],
      ["/applications/assistant", "Apply Sprint readiness"],
      ["/applications", "Application lifecycle readiness"],
      ["/resumes/generated", "Material readiness"],
      ["/evidence", "Evidence readiness"],
      ["/outcomes", "Outcome learning readiness"],
    ] as const;

    for (const [path, title] of pages) {
      await page.goto(path);
      await expect(page.getByText(title)).toBeVisible();
      await expect(page.getByRole("link", { name: "Open cockpit" }).first()).toBeVisible();
    }
  });
});

test.describe("product coherence readiness API", () => {
  test("supports readiness override actions through the protected API", async ({ request }) => {
    const response = await request.patch("/api/readiness/setup.profile", {
      data: { action: "snooze", note: "Playwright acceptance check" },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "setup.profile" }),
    ]));

    const reset = await request.patch("/api/readiness/setup.profile", {
      data: { action: "reset" },
    });
    expect(reset.ok()).toBeTruthy();
  });
});
