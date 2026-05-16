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

export function createCanonicalJobKeys(job: CanonicalJobParts) {
  const company = normalizeCompany(job.company);
  const title = normalizeTitle(job.title);
  const titleFamily = normalizeTitleFamily(job.title);
  const location = normalizeLocation(job.location);
  const locationFamily = normalizeLocationFamily(job.location);

  return uniqueStrings([
    [company, title, location].join("|"),
    [company, title, locationFamily].join("|"),
    [company, titleFamily, locationFamily].join("|"),
  ].filter((key) => !key.includes("||")));
}

export function hasSameCanonicalJob(a: CanonicalJobParts, b: CanonicalJobParts) {
  const leftKeys = new Set(createCanonicalJobKeys(a));
  return createCanonicalJobKeys(b).some((key) => leftKeys.has(key));
}

export function hasSameCompanyTitleLocation(a: NormalizedJobPosting, b: NormalizedJobPosting) {
  return (
    [a.company, a.title, a.location ?? ""].join("|").toLowerCase() ===
    [b.company, b.title, b.location ?? ""].join("|").toLowerCase()
  );
}

function normalizeCompany(value: string) {
  return normalizeWords(value)
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|company|co|plc|gmbh|ag|sa|sas|holdings|group)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value: string) {
  return normalizeWords(value)
    .replace(/\b(sr|snr)\b/g, "senior")
    .replace(/\b(jr)\b/g, "junior")
    .replace(/\bfront end\b/g, "frontend")
    .replace(/\bback end\b/g, "backend")
    .replace(/\bfull stack\b/g, "fullstack")
    .replace(/\b(sw|swe)\b/g, "software engineer")
    .replace(/\beng\b/g, "engineer")
    .replace(/\bsoftware engineer\b/g, "engineer")
    .replace(/\bii\b/g, "2")
    .replace(/\biii\b/g, "3")
    .replace(/\biv\b/g, "4")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitleFamily(value: string) {
  const normalized = normalizeTitle(value)
    .replace(/\b(engineering|engineer)\b/g, "engineer")
    .replace(/\b(development|developer)\b/g, "developer")
    .replace(/\b(application|applications|apps)\b/g, "app")
    .replace(/\b(platforms)\b/g, "platform")
    .replace(/\b(systems)\b/g, "system")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized.split(" ").filter((token) => token.length > 1 && !TITLE_NOISE_WORDS.has(token));
  return tokens.join(" ");
}

function normalizeLocation(value: string | null | undefined) {
  const normalized = normalizeWords(value ?? "");
  if (!normalized || normalized === "remote" || /\b(worldwide|anywhere|global)\b/.test(normalized)) return "remote";
  return normalized.replace(/\b(remote|hybrid|onsite)\b/g, "").replace(/\s+/g, " ").trim() || "remote";
}

function normalizeLocationFamily(value: string | null | undefined) {
  const normalized = normalizeLocation(value);
  if (!normalized || normalized === "remote") return "remote";
  if (/\b(united states|usa|us|u s|america|north america|americas)\b/.test(normalized)) return "remote";
  if (/\b(canada|ca)\b/.test(normalized)) return "canada";
  if (/\b(united kingdom|uk|u k|england|london)\b/.test(normalized)) return "uk";
  if (/\b(europe|emea|eu)\b/.test(normalized)) return "europe";
  return normalized;
}

function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\./g, " ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

const TITLE_NOISE_WORDS = new Set([
  "role",
  "position",
  "job",
  "opening",
  "team",
  "remote",
  "hybrid",
  "onsite",
  "usa",
  "us",
  "uk",
  "eu",
]);
