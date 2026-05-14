import { createCanonicalJobKey } from "@/lib/job-search/dedupe";

type MatchWithJob = {
  overallScore: number;
  createdAt: Date;
  jobPosting: {
    company: string;
    title: string;
    location: string | null;
    lastSeenAt?: Date;
  };
};

export function uniqueMatchesByCanonicalJob<T extends MatchWithJob>(matches: T[]): T[] {
  const bestByKey = new Map<string, T>();

  for (const match of matches) {
    const key = createCanonicalJobKey(match.jobPosting);
    const current = bestByKey.get(key);
    if (!current || compareMatchPriority(match, current) > 0) {
      bestByKey.set(key, match);
    }
  }

  return Array.from(bestByKey.values());
}

function compareMatchPriority(left: MatchWithJob, right: MatchWithJob) {
  if (left.overallScore !== right.overallScore) return left.overallScore - right.overallScore;
  const leftSeen = left.jobPosting.lastSeenAt?.getTime() ?? left.createdAt.getTime();
  const rightSeen = right.jobPosting.lastSeenAt?.getTime() ?? right.createdAt.getTime();
  return leftSeen - rightSeen;
}
