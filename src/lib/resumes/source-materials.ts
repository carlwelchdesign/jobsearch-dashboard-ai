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

export function selectResumeSourceWorkExperiences<T extends Pick<WorkExperience, "company" | "title" | "startDate" | "endDate" | "sourceResumeUploadId">>(
  workExperiences: T[],
  latestUploadId: string | null | undefined,
) {
  if (!latestUploadId) return workExperiences;

  const latestUploadWork = workExperiences.filter((work) => work.sourceResumeUploadId === latestUploadId);
  const profileWork = workExperiences.filter((work) => !work.sourceResumeUploadId);

  return [
    ...latestUploadWork,
    ...profileWork.filter(
      (work) =>
        !latestUploadWork.some((uploadWork) =>
          resumeRolesEquivalent(work, uploadWork),
        ),
    ),
  ];
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

export function resumeRoleBaseKey(role: { company: string; title: string }) {
  return `${canonicalResumeCompany(role.company)}|${canonicalResumeTitle(role.title)}`;
}

export function resumeRolesEquivalent(
  left: { company: string; title: string; startDate?: string | null; endDate?: string | null },
  right: { company: string; title: string; startDate?: string | null; endDate?: string | null },
) {
  if (resumeRoleBaseKey(left) !== resumeRoleBaseKey(right)) return false;
  if (!hasResumeDate(left) || !hasResumeDate(right)) return true;
  return resumeDateSignature(left) === resumeDateSignature(right);
}

function canonicalResumeCompany(company: string) {
  const normalized = normalizeResumeRoleText(company);
  if (/\b(?:taser|axon)\b/.test(normalized)) return "taser axon";
  if (/\bgeneral dynamics(?: land systems)?\b/.test(normalized))
    return "general dynamics land systems";
  return normalized;
}

function canonicalResumeTitle(title: string) {
  const normalized = normalizeResumeRoleText(title);
  if (/\bfront end developer\b|\bfrontend developer\b/.test(normalized))
    return "front end developer";
  if (/\bmanager\b/.test(normalized) && /\blead developer\b/.test(normalized))
    return "manager lead developer";
  return normalized;
}

function normalizeResumeRoleText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasResumeDate(role: { startDate?: string | null; endDate?: string | null }) {
  return Boolean(role.startDate?.trim() || role.endDate?.trim());
}

function resumeDateSignature(role: { startDate?: string | null; endDate?: string | null }) {
  return `${normalizeResumeDate(role.startDate)}|${normalizeResumeDate(role.endDate)}`;
}

function normalizeResumeDate(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
