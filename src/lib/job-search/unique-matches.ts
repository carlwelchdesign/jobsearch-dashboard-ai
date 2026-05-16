import { createCanonicalJobKeys } from "@/lib/job-search/dedupe";

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
  const selected = new Set<T>();

  for (const match of matches) {
    const keys = createCanonicalJobKeys(match.jobPosting);
    const current = keys.map((key) => bestByKey.get(key)).find(Boolean);
    if (!current || compareMatchPriority(match, current) > 0) {
      for (const key of keys) bestByKey.set(key, match);
    }
  }

  return Array.from(bestByKey.values()).filter((match) => {
    if (selected.has(match)) return false;
    selected.add(match);
    return true;
  });
}

function compareMatchPriority(left: MatchWithJob, right: MatchWithJob) {
  if (left.overallScore !== right.overallScore) return left.overallScore - right.overallScore;
  const leftSeen = left.jobPosting.lastSeenAt?.getTime() ?? left.createdAt.getTime();
  const rightSeen = right.jobPosting.lastSeenAt?.getTime() ?? right.createdAt.getTime();
  return leftSeen - rightSeen;
}
