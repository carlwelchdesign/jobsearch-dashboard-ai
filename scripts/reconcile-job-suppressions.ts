import { JobMatchStatus } from "@prisma/client";
import { isJobSuppressed, loadJobSuppressionState, recordArchivedJobSuppression, recordRejectedJobSuppression, recordSubmittedJobSuppression } from "@/lib/jobs/suppression";
import { prisma } from "@/lib/prisma";
import { submittedApplicationStatuses } from "@/lib/applications/job-filters";

const activeStatuses = [
  JobMatchStatus.discovered,
  JobMatchStatus.needs_review,
  JobMatchStatus.approved,
  JobMatchStatus.saved_for_later,
  JobMatchStatus.resume_generated,
  JobMatchStatus.cover_letter_generated,
  JobMatchStatus.ready_to_apply,
];

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  let suppressionsRecorded = 0;
  let matchesReconciled = 0;

  for (const user of users) {
    const [suppressedMatches, submittedApplications] = await Promise.all([
      prisma.jobProfileMatch.findMany({
        where: {
          status: { in: [JobMatchStatus.rejected, JobMatchStatus.archived] },
          jobSearchProfile: { userId: user.id },
        },
        include: {
          jobPosting: {
            select: {
              id: true,
              company: true,
              title: true,
              location: true,
              duplicateGroupId: true,
            },
          },
        },
      }),
      prisma.application.findMany({
        where: {
          userId: user.id,
          status: { in: submittedApplicationStatuses },
        },
        include: {
          jobPosting: {
            select: {
              id: true,
              company: true,
              title: true,
              location: true,
              duplicateGroupId: true,
            },
          },
        },
      }),
    ]);

    for (const match of suppressedMatches) {
      if (match.status === JobMatchStatus.rejected) {
        await recordRejectedJobSuppression({
          userId: user.id,
          job: match.jobPosting,
          jobProfileMatchId: match.id,
          source: "suppression_reconcile",
          reason: "Backfilled from existing rejected match.",
        });
      } else {
        await recordArchivedJobSuppression({
          userId: user.id,
          job: match.jobPosting,
          jobProfileMatchId: match.id,
          source: "suppression_reconcile",
          reason: "Backfilled from existing archived match.",
        });
      }
      suppressionsRecorded += 1;
    }

    for (const application of submittedApplications) {
      await recordSubmittedJobSuppression({
        userId: user.id,
        job: application.jobPosting,
        applicationId: application.id,
        jobProfileMatchId: application.jobProfileMatchId,
        source: "suppression_reconcile",
        reason: `Backfilled from existing ${application.status} application.`,
      });
      suppressionsRecorded += 1;
    }

    const suppressionState = await loadJobSuppressionState(user.id);
    const activeMatches = await prisma.jobProfileMatch.findMany({
      where: {
        status: { in: activeStatuses },
        jobSearchProfile: { userId: user.id },
      },
      select: {
        id: true,
        jobPosting: {
          select: {
            company: true,
            title: true,
            location: true,
            duplicateGroupId: true,
          },
        },
      },
      take: 5000,
    });
    const suppressedActiveIds = activeMatches
      .filter((match) => isJobSuppressed(match.jobPosting, suppressionState))
      .map((match) => match.id);
    if (suppressedActiveIds.length) {
      const result = await prisma.jobProfileMatch.updateMany({
        where: { id: { in: suppressedActiveIds } },
        data: {
          status: JobMatchStatus.archived,
          reviewedAt: new Date(),
        },
      });
      matchesReconciled += result.count;
    }
  }

  const globalCompanyCooldowns = await prisma.jobSuppression.findMany({
    where: {
      kind: "COMPANY_COOLDOWN",
      titleFamilyKey: "*",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    distinct: ["companyKey"],
    select: {
      companyKey: true,
      expiresAt: true,
      reason: true,
    },
  });
  for (const cooldown of globalCompanyCooldowns) {
    for (const user of users) {
      await prisma.jobSuppression.upsert({
        where: {
          userId_kind_canonicalKey: {
            userId: user.id,
            kind: "COMPANY_COOLDOWN",
            canonicalKey: `${cooldown.companyKey}|*`,
          },
        },
        update: {
          companyKey: cooldown.companyKey,
          titleFamilyKey: "*",
          locationKey: "*",
          source: "suppression_reconcile",
          reason: cooldown.reason ?? "Mirrored company cooldown across local user records.",
          expiresAt: cooldown.expiresAt,
        },
        create: {
          userId: user.id,
          kind: "COMPANY_COOLDOWN",
          canonicalKey: `${cooldown.companyKey}|*`,
          companyKey: cooldown.companyKey,
          titleFamilyKey: "*",
          locationKey: "*",
          source: "suppression_reconcile",
          reason: cooldown.reason ?? "Mirrored company cooldown across local user records.",
          expiresAt: cooldown.expiresAt,
        },
      });
    }
  }
  for (const user of users) {
    const suppressionState = await loadJobSuppressionState(user.id);
    const activeMatches = await prisma.jobProfileMatch.findMany({
      where: {
        status: { in: activeStatuses },
        jobSearchProfile: { userId: user.id },
      },
      select: {
        id: true,
        jobPosting: {
          select: {
            company: true,
            title: true,
            location: true,
            duplicateGroupId: true,
          },
        },
      },
      take: 5000,
    });
    const suppressedActiveIds = activeMatches
      .filter((match) => isJobSuppressed(match.jobPosting, suppressionState))
      .map((match) => match.id);
    if (suppressedActiveIds.length) {
      const result = await prisma.jobProfileMatch.updateMany({
        where: { id: { in: suppressedActiveIds } },
        data: {
          status: JobMatchStatus.archived,
          reviewedAt: new Date(),
        },
      });
      matchesReconciled += result.count;
    }
  }

  console.log(JSON.stringify({ users: users.length, suppressionsRecorded, matchesReconciled }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
