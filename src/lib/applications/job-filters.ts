import { JobMatchStatus } from "@prisma/client";
import { createCanonicalJobKeys } from "@/lib/job-search/dedupe";

type JobIdentity = {
  company: string;
  title: string;
  location: string | null;
  lastSeenAt?: Date;
};

type ApplicationJobRecord = {
  status?: JobMatchStatus | string;
  jobPosting: JobIdentity;
};

export const submittedApplicationStatuses: JobMatchStatus[] = [
  JobMatchStatus.applied,
  JobMatchStatus.follow_up_due,
  JobMatchStatus.screening,
  JobMatchStatus.interviewing,
  JobMatchStatus.rejected_by_company,
  JobMatchStatus.offer,
  JobMatchStatus.archived,
];

export const suppressedJobMatchStatuses: JobMatchStatus[] = [
  JobMatchStatus.rejected,
  JobMatchStatus.archived,
];

export function applicationJobKeySet(applications: ApplicationJobRecord[]) {
  const keys = new Set<string>();
  for (const application of applications) {
    for (const key of createCanonicalJobKeys(application.jobPosting)) {
      keys.add(key);
    }
  }
  return keys;
}

export function submittedApplicationJobKeySet(applications: ApplicationJobRecord[]) {
  return applicationJobKeySet(applications.filter((application) => isSubmittedApplicationStatus(application.status)));
}

export function suppressedJobKeySet(records: ApplicationJobRecord[]) {
  return applicationJobKeySet(records.filter((record) => isSuppressedJobStatus(record.status)));
}

export function hasApplicationForJob(job: JobIdentity, applicationKeys: Set<string>) {
  return createCanonicalJobKeys(job).some((key) => applicationKeys.has(key));
}

export function isSubmittedApplicationStatus(status: JobMatchStatus | string | undefined) {
  return submittedApplicationStatuses.includes(status as JobMatchStatus);
}

export function isSuppressedJobStatus(status: JobMatchStatus | string | undefined) {
  return isSubmittedApplicationStatus(status) || suppressedJobMatchStatuses.includes(status as JobMatchStatus);
}
