import type { ExperienceBullet, WorkExperience } from "@prisma/client";

export function selectResumeSourceBullets<T extends Pick<ExperienceBullet, "id" | "text" | "sourceResumeUploadId" | "metrics">>(
  bullets: T[],
  latestUploadId: string | null | undefined,
) {
  const latestUploadBullets = latestUploadId
    ? bullets.filter((bullet) => bullet.sourceResumeUploadId === latestUploadId)
    : [];
  const profileBullets = bullets.filter((bullet) => !bullet.sourceResumeUploadId);

  if (latestUploadBullets.length >= 8) {
    return dedupeBullets([...profileBullets, ...latestUploadBullets]);
  }

  return dedupeBullets(bullets);
}

export function selectResumeSourceWorkExperiences<T extends Pick<WorkExperience, "sourceResumeUploadId">>(
  workExperiences: T[],
  latestUploadId: string | null | undefined,
) {
  return workExperiences.filter((work) => !latestUploadId || !work.sourceResumeUploadId || work.sourceResumeUploadId === latestUploadId);
}

export function summarizeResumeSourceBullets<T extends Pick<ExperienceBullet, "id" | "sourceResumeUploadId" | "metrics">>(
  bullets: T[],
  latestUploadId: string | null | undefined,
) {
  const profileBullets = bullets.filter((bullet) => !bullet.sourceResumeUploadId);
  const latestUploadBullets = latestUploadId
    ? bullets.filter((bullet) => bullet.sourceResumeUploadId === latestUploadId)
    : [];
  const roleDescriptionDigestBulletIds = profileBullets
    .filter((bullet) => isRoleDescriptionDigestBullet(bullet))
    .map((bullet) => bullet.id);

  return {
    totalBulletCount: bullets.length,
    profileBulletCount: profileBullets.length,
    latestUploadBulletCount: latestUploadBullets.length,
    roleDescriptionDigestBulletIds,
  };
}

function dedupeBullets<T extends Pick<ExperienceBullet, "text">>(bullets: T[]) {
  const seen = new Set<string>();
  return bullets.filter((bullet) => {
    const key = bullet.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRoleDescriptionDigestBullet<T extends Pick<ExperienceBullet, "metrics">>(bullet: T) {
  return Boolean(
    bullet.metrics &&
      typeof bullet.metrics === "object" &&
      !Array.isArray(bullet.metrics) &&
      "source" in bullet.metrics &&
      bullet.metrics.source === "role_description_digest",
  );
}
