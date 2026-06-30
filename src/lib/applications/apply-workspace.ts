export type CanonicalApplicationCandidate = {
  id: string;
  status: string;
  resumeId?: string | null;
  coverLetterId?: string | null;
  appliedAt?: Date | string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
  applicationPackets?: Array<{ status?: string | null; updatedAt?: Date | string | null }> | null;
  events?: Array<{ createdAt?: Date | string | null }> | null;
  outcomes?: Array<{ occurredAt?: Date | string | null }> | null;
};

export type ApplyWorkspacePrimaryAction =
  | {
      kind: "prepare_packet";
      label: "Prepare packet";
      detail: string;
      postTo: string;
      severity: "success";
    }
  | {
      kind: "review_packet";
      label: "Review packet";
      detail: string;
      href: string;
      severity: "warning";
    }
  | {
      kind: "approve_packet";
      label: "Approve packet";
      detail: string;
      href: string;
      severity: "success";
    }
  | {
      kind: "launch_assistant";
      label: "Launch assistant";
      detail: string;
      postTo: string;
      severity: "success";
    }
  | {
      kind: "mark_applied";
      label: "Mark applied";
      detail: string;
      href: string;
      severity: "primary";
    }
  | {
      kind: "track_outcome";
      label: "Track outcome";
      detail: string;
      href: string;
      severity: "primary";
    };

export function selectCanonicalApplicationForJob<T extends CanonicalApplicationCandidate>(applications: T[]): T | null {
  if (applications.length === 0) return null;
  return [...applications].sort((left, right) => canonicalApplicationScore(right) - canonicalApplicationScore(left))[0] ?? null;
}

export function canonicalApplicationScore(application: CanonicalApplicationCandidate) {
  const hasResume = Boolean(application.resumeId);
  const hasCoverLetter = Boolean(application.coverLetterId);
  const hasMaterials = hasResume && hasCoverLetter;
  const latestPacket = latestTime(application.applicationPackets?.map((packet) => packet.updatedAt) ?? []);
  const latestEvent = latestTime(application.events?.map((event) => event.createdAt) ?? []);
  const latestOutcome = latestTime(application.outcomes?.map((outcome) => outcome.occurredAt) ?? []);
  const updatedAt = toTime(application.updatedAt);
  const createdAt = toTime(application.createdAt);
  const activityTime = Math.max(updatedAt, latestPacket, latestEvent, latestOutcome, createdAt);
  const packetStatus = application.applicationPackets?.[0]?.status ?? null;

  return [
    hasMaterials ? 1_000_000_000_000_000 : 0,
    application.status === "ready_to_apply" ? 800_000_000_000_000 : 0,
    packetStatus === "APPROVED" || packetStatus === "SUBMITTED" ? 600_000_000_000_000 : 0,
    application.appliedAt ? 500_000_000_000_000 : 0,
    hasResume || hasCoverLetter ? 300_000_000_000_000 : 0,
    packetStatus ? 100_000_000_000_000 : 0,
    statusWeight(application.status) * 1_000_000_000_000,
    activityTime,
  ].reduce((sum, value) => sum + value, 0);
}

export function getApplyWorkspacePrimaryAction(input: {
  applicationId: string;
  jobPostingId: string;
  applicationStatus: string;
  appliedAt?: Date | null;
  hasResume: boolean;
  hasCoverLetter: boolean;
  packetStatus?: string | null;
  qaIssueCount: number;
  materialBlocked?: boolean;
  canApprovePacket: boolean;
  assistantLaunched: boolean;
  hasAppliedOutcome: boolean;
}): ApplyWorkspacePrimaryAction {
  const hasMaterials = input.hasResume && input.hasCoverLetter;
  const packetApproved = isPacketApproved(input.packetStatus, input.applicationStatus, input.appliedAt);
  const submitted = Boolean(input.appliedAt) || input.hasAppliedOutcome || input.packetStatus === "SUBMITTED";

  if (!hasMaterials) {
    return {
      kind: "prepare_packet",
      label: "Prepare packet",
      detail: "Generate the tailored resume and cover letter before moving into Apply Sprint.",
      postTo: `/api/jobs/${input.jobPostingId}/prepare-application`,
      severity: "success",
    };
  }

  if (input.canApprovePacket && !packetApproved) {
    return {
      kind: "approve_packet",
      label: "Approve packet",
      detail: "Materials are ready for your approval before assisted form filling.",
      href: `/applications/${input.applicationId}#apply`,
      severity: "success",
    };
  }

  if (packetApproved && !input.assistantLaunched && !submitted) {
    return {
      kind: "launch_assistant",
      label: "Launch assistant",
      detail: input.qaIssueCount > 0
        ? `${input.qaIssueCount} material QA advisory item${input.qaIssueCount === 1 ? "" : "s"} visible. Open the local assistant and submit manually after review.`
        : "Open the local assistant to stage the employer form. Final submission stays manual.",
      postTo: `/api/applications/${input.applicationId}/launch-assistant`,
      severity: "success",
    };
  }

  if (!submitted) {
    return {
      kind: "mark_applied",
      label: "Mark applied",
      detail: "Record the manual submission after you submit on the employer site.",
      href: `/applications/${input.applicationId}#history`,
      severity: "primary",
    };
  }

  return {
    kind: "track_outcome",
    label: "Track outcome",
    detail: "Record replies, screens, rejections, and offers as they happen.",
    href: `/applications/${input.applicationId}#history`,
    severity: "primary",
  };
}

export function isPacketApproved(packetStatus: string | null | undefined, applicationStatus: string, appliedAt?: Date | null) {
  return packetStatus === "APPROVED" || packetStatus === "SUBMITTED" || applicationStatus === "ready_to_apply" || Boolean(appliedAt);
}

function statusWeight(status: string) {
  switch (status) {
    case "offer":
      return 95;
    case "interviewing":
    case "screening":
      return 90;
    case "applied":
    case "follow_up_due":
      return 85;
    case "ready_to_apply":
      return 80;
    case "approved":
    case "resume_generated":
    case "cover_letter_generated":
      return 70;
    case "saved_for_later":
      return 40;
    case "rejected":
    case "rejected_by_company":
    case "archived":
      return 10;
    default:
      return 50;
  }
}

function latestTime(values: Array<Date | string | null | undefined>) {
  return values.reduce((latest, value) => Math.max(latest, toTime(value)), 0);
}

function toTime(value: Date | string | null | undefined) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}
