import { describe, expect, it } from "vitest";
import type { ApplicationAutomationRun, JobPosting } from "@prisma/client";
import { summarizeAutomationBlockerRuns } from "@/lib/applications/automation-analytics";

describe("automation analytics", () => {
  it("summarizes automation blockers by ATS provider", () => {
    const runs = [
      run("greenhouse", "BLOCKED", "captcha"),
      run("greenhouse", "FAILED", "assistant_error"),
      run("lever", "READY_TO_SUBMIT", null),
      run("lever", "SUBMITTED", null),
    ];

    expect(summarizeAutomationBlockerRuns(runs)[0]).toMatchObject({
      provider: "greenhouse",
      totalRuns: 2,
      blockedRuns: 2,
      failedRuns: 1,
      blockerTypes: [
        { type: "captcha", count: 1 },
        { type: "assistant_error", count: 1 },
      ],
    });
  });
});

function run(atsProvider: JobPosting["atsProvider"], status: ApplicationAutomationRun["status"], blockerType: string | null) {
  return {
    id: `${atsProvider}-${status}-${blockerType ?? "none"}`,
    applicationId: `app_${atsProvider}`,
    jobPostingId: `job_${atsProvider}`,
    userId: "user_1",
    status,
    currentUrl: null,
    logPath: null,
    pid: null,
    graphThreadId: null,
    currentNode: null,
    blockerType,
    blockerMessage: blockerType ? `Blocked by ${blockerType}` : null,
    actionsJson: [],
    screenshotsJson: [],
    workflowStateJson: {},
    startedAt: new Date(),
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    jobPosting: {
      atsProvider,
      company: "Acme",
      title: "Senior Frontend Engineer",
    },
  } as ApplicationAutomationRun & { jobPosting: Pick<JobPosting, "atsProvider" | "company" | "title"> };
}
