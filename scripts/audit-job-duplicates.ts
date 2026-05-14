import { createCanonicalJobKey } from "../src/lib/job-search/dedupe";
import { prisma } from "../src/lib/prisma";

async function main() {
  const jobs = await prisma.jobPosting.findMany({
    select: {
      id: true,
      company: true,
      title: true,
      location: true,
      applicationUrl: true,
      source: { select: { name: true, type: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const groups = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const key = createCanonicalJobKey(job);
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }

  const duplicates = Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .sort((left, right) => right[1].length - left[1].length);

  console.log(`Jobs: ${jobs.length}`);
  console.log(`Duplicate groups: ${duplicates.length}`);
  console.log(`Jobs in duplicate groups: ${duplicates.reduce((total, [, group]) => total + group.length, 0)}`);

  for (const [key, group] of duplicates.slice(0, 25)) {
    console.log(`\n${group.length} duplicates: ${key}`);
    for (const job of group) {
      console.log(`- ${job.id} | ${job.company} | ${job.title} | ${job.location ?? "Unknown"} | ${job.source?.name ?? "Unknown"} | ${job.applicationUrl ?? "No URL"}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
