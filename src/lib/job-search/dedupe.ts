import crypto from "crypto";
import type { NormalizedJobPosting } from "./source-adapter";

type CanonicalJobParts = Pick<NormalizedJobPosting, "company" | "title"> & { location?: string | null };

export function createJobContentHash(
  job: Pick<NormalizedJobPosting, "title" | "company" | "description" | "applicationUrl">,
) {
  const value = [job.title, job.company, job.description, job.applicationUrl ?? ""]
    .map((part) => part.trim().toLowerCase())
    .join("|");

  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createCanonicalJobKey(job: CanonicalJobParts) {
  return [normalizeCompany(job.company), normalizeTitle(job.title), normalizeLocation(job.location)].join("|");
}

export function hasSameCanonicalJob(a: CanonicalJobParts, b: CanonicalJobParts) {
  return createCanonicalJobKey(a) === createCanonicalJobKey(b);
}

export function hasSameCompanyTitleLocation(a: NormalizedJobPosting, b: NormalizedJobPosting) {
  return (
    [a.company, a.title, a.location ?? ""].join("|").toLowerCase() ===
    [b.company, b.title, b.location ?? ""].join("|").toLowerCase()
  );
}

function normalizeCompany(value: string) {
  return normalizeWords(value)
    .replace(/\b(inc|llc|ltd|corp|corporation|company|co|plc|gmbh|ag|sa|sas)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value: string) {
  return normalizeWords(value)
    .replace(/\b(sr|snr)\b/g, "senior")
    .replace(/\b(jr)\b/g, "junior")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocation(value: string | null | undefined) {
  const normalized = normalizeWords(value ?? "");
  if (!normalized || normalized === "remote" || /\b(worldwide|anywhere)\b/.test(normalized)) return "remote";
  return normalized.replace(/\b(remote|hybrid|onsite)\b/g, "").replace(/\s+/g, " ").trim() || "remote";
}

function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}
