import type { JobSearchProfile } from "@prisma/client";

export type ScoreInput = {
  company: string;
  title: string;
  description: string;
  location?: string | null;
  salaryMin?: number | null;
};

export type JobSearchTitleClassification = {
  frontend: boolean;
  fullStack: boolean;
  seniorIc: boolean;
  overSenior: boolean;
  management: boolean;
  backendDataPlatformOnly: boolean;
  nonTarget: boolean;
  genericSoftwareWithoutFrontend: boolean;
};

export function scoreJobForProfile(job: ScoreInput, profile: JobSearchProfile) {
  const haystack = [job.title, job.company, job.location ?? "", job.description].join(" ").toLowerCase();
  const titleHaystack = job.title.toLowerCase();
  const titles = stringArray(profile.titles);
  const required = stringArray(profile.keywordsRequired);
  const preferred = stringArray(profile.keywordsPreferred);
  const excluded = stringArray(profile.keywordsExcluded);
  const excludedCompanies = stringArray(profile.excludedCompanies);
  const industries = stringArray(profile.industries);
  const excludedTitles = stringArray(profile.excludedTitles);
  const companyExcludedMatches = excludedCompanies.filter((company) => includesTerm(job.company, company));

  const titleMatches = titles.filter((title) => includesTerm(job.title, title));
  const adjacentTitleMatches = titles.filter((title) => titleMatches.includes(title) || hasAdjacentTitleMatch(titleHaystack, title));
  const preferredMatches = preferred.filter((keyword) => includesTerm(haystack, keyword));
  const requiredMatches = required.filter((keyword) => includesTerm(haystack, keyword));
  const industryMatches = industries.filter((industry) => includesTerm(haystack, industry));
  const excludedKeywordMatches = excluded.filter((keyword) => includesTerm(haystack, keyword));
  const excludedTitleMatches = excludedTitles.filter((keyword) => includesTerm(job.title, keyword));
  const excludedMatches = [...excludedKeywordMatches, ...excludedTitleMatches];
  const isBlockedCompany = companyExcludedMatches.length > 0;
  const roleFit = calculateRoleFit(titleHaystack, titles);
  const profileText = [...titles, ...required, ...preferred].join(" ").toLowerCase();
  const wantsFrontend = wantsFrontendProfile(profileText);
  const classification = classifyJobSearchTitle(job.title, job.description);
  const lowLevelMismatch = hasLowLevelSystemsMismatch(haystack, titles, required, preferred);
  const explicitTitleMatch = titles.some((title) => includesTerm(job.title, title));
  const requiredCoverage = required.length ? requiredMatches.length / required.length : 1;
  const missingRequiredPenalty = required.length ? Math.min(18, Math.round((1 - requiredCoverage) * 18)) : 0;
  const profileMismatchPenalty = calculateProfileMismatchPenalty(classification, wantsFrontend, profileText, titleHaystack, explicitTitleMatch);

  const titleFit = isBlockedCompany ? 0 : clamp(25 + roleFit * 0.55 + adjacentTitleMatches.length * 12 + (classification.seniorIc ? 10 : 0) - (classification.overSenior ? 14 : 0) - excludedMatches.length * 25);
  const skillFit = clamp(56 + preferredMatches.length * 5 + requiredMatches.length * 7 + requiredCoverage * 16 - missingRequiredPenalty - (classification.nonTarget ? 18 : 0));
  const seniorityFit = clamp(classification.seniorIc ? 90 : classification.overSenior ? 35 : 58);
  const industryFit = clamp(55 + industryMatches.length * 12);
  const compensationFit = clamp(job.salaryMin || profile.includeUnknownSalary ? 78 : 45);
  const remoteFit = clamp(remoteScore(haystack, profile.remotePreference));
  const relocationFit = clamp(relocationScore(haystack, profile.relocationPreference));
  const geographyFit = clamp(geographyScore(job.location ?? "", profile));
  const rolePenalty = roleFit < 35 ? 24 : roleFit < 55 ? 10 : 0;
  const overallScore = isBlockedCompany ? 0 : clamp(
    Math.round(
      titleFit * 0.26 +
        skillFit * 0.22 +
        seniorityFit * 0.15 +
        industryFit * 0.1 +
        compensationFit * 0.1 +
        remoteFit * 0.1 +
        geographyFit * 0.08 +
        relocationFit * 0.05 -
        excludedMatches.length * 20 -
        rolePenalty -
        profileMismatchPenalty -
        (lowLevelMismatch ? 45 : 0),
    ),
  );

  const strongestMatches = [...adjacentTitleMatches, ...requiredMatches, ...preferredMatches, ...industryMatches].slice(0, 8);
  const concerns = [
    ...(companyExcludedMatches.length ? [`Excluded company detected: ${companyExcludedMatches.join(", ")}`] : []),
    ...(roleFit < 35 ? ["Title does not look like a target software, frontend, full-stack, platform, product, AI, or developer-tools role."] : []),
    ...(lowLevelMismatch ? ["Low-level C++, embedded, robotics, or autonomy role does not match the target web/frontend/full-stack profile."] : []),
    ...(classification.overSenior && wantsFrontend && !allowsStaffTitle(profileText, titleHaystack) ? ["Staff, principal, lead, manager, director, or architect seniority is outside the Senior Frontend IC target."] : []),
    ...(classification.management ? ["Management or leadership title is outside the Senior Frontend IC target."] : []),
    ...(classification.backendDataPlatformOnly && wantsFrontend ? ["Backend, data, infrastructure, or platform-only title lacks clear frontend/UI scope."] : []),
    ...(classification.nonTarget ? ["Developer advocacy, curriculum, transformation, support, or solutions role is outside the frontend IC target."] : []),
    ...(classification.genericSoftwareWithoutFrontend && wantsFrontend ? ["Generic software title lacks clear frontend/UI evidence."] : []),
    ...(excludedMatches.length ? [`Excluded terms detected: ${excludedMatches.join(", ")}`] : []),
    ...(job.salaryMin || profile.includeUnknownSalary ? [] : ["Salary is unknown and this profile excludes unknown salary."]),
    ...(required.length && requiredCoverage < 0.35 ? [`Missing most target keywords: ${required.filter((keyword) => !requiredMatches.includes(keyword)).join(", ")}`] : []),
  ];

  return {
    overallScore,
    titleFit,
    skillFit,
    seniorityFit,
    industryFit,
    compensationFit,
    remoteFit,
    relocationFit,
    strongestMatches,
    concerns,
    missingKeywords: required.filter((keyword) => !requiredMatches.includes(keyword)),
    recommendedAction: overallScore >= profile.minimumMatchScore ? "Review and consider approval" : "Below threshold",
    aiExplanation:
      strongestMatches.length > 0
        ? `Matched ${strongestMatches.join(", ")} for ${profile.name}.`
        : `Scored using profile threshold and basic title, skill, remote, and compensation signals for ${profile.name}.`,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function includesTerm(value: string, term: string) {
  const haystack = normalizeTerm(value);
  const needle = normalizeTerm(term);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;
  const aliases = termAliases(needle);
  return aliases.some((alias) => haystack.includes(alias));
}

export function classifyJobSearchTitle(title: string, description = ""): JobSearchTitleClassification {
  const normalizedTitle = normalizeTerm(title);
  const haystack = normalizeTerm(`${title} ${description}`);
  const frontend = frontendPattern().test(haystack);
  const frontendTitle = frontendPattern().test(normalizedTitle);
  const fullStack = /\b(full stack|fullstack|full-stack)\b/i.test(title);
  const management = /\b(manager|director|head of|vp|vice president|chief|cto)\b/i.test(title);
  const overSenior = /\b(staff|principal|principle|lead|architect|manager|director|head of)\b/i.test(title);
  const seniorIc = /\b(senior|sr)\b/i.test(title) && !overSenior;
  const backendDataPlatform = /\b(backend|back end|data engineer|data platform|analytics engineer|infrastructure|devops|sre|site reliability|compute platform|monetization platform|distributed systems|systems engineer|security platform)\b/i.test(title);
  const backendDataPlatformOnly = backendDataPlatform && !frontendTitle && !fullStack;
  const nonTarget = isClearlyNonTargetTitle(normalizedTitle) || /\b(developer advocate|devrel|developer relations|curriculum|instructor|support engineer|customer support|solutions engineer|solutions architect|solution architect|transformation manager|applied ai transformation|forward deployed|sales engineer|integration engineer)\b/i.test(title);
  const genericSoftwareWithoutFrontend = /\bsoftware engineer\b/i.test(title) && !frontendTitle && !fullStack;

  return {
    frontend,
    fullStack,
    seniorIc,
    overSenior,
    management,
    backendDataPlatformOnly,
    nonTarget,
    genericSoftwareWithoutFrontend,
  };
}

function calculateRoleFit(title: string, profileTitles: string[]) {
  if (isClearlyNonTargetTitle(title)) return 8;
  if (lowLevelOrHardwarePattern().test(title)) return 18;
  const profileText = profileTitles.join(" ").toLowerCase();
  const wantsFrontend = wantsFrontendProfile(profileText);
  const wantsFullStack = /\b(full.?stack|software engineer|product engineer)\b/i.test(profileText);
  const classification = classifyJobSearchTitle(title);
  if (wantsFrontend && classification.management) return 12;
  if (wantsFrontend && classification.nonTarget) return 14;
  if (wantsFrontend && classification.backendDataPlatformOnly) return 28;
  if (wantsFrontend && /\b(backend|ios|android|mobile|devops|sre|infrastructure)\b/i.test(title) && !/\b(frontend|front-end|full.?stack|web|ui|react)\b/i.test(title)) return 38;
  if (!wantsFullStack && /\b(backend|infrastructure|devops|sre)\b/i.test(title) && !/\b(frontend|front-end|full.?stack|web|ui|react|product)\b/i.test(title)) return 42;
  if (profileTitles.some((profileTitle) => includesTerm(title, profileTitle))) return 96;
  if (wantsFrontend && classification.overSenior && !frontendPattern().test(title)) return 24;
  if (frontendPattern().test(title) || /\b(product engineer|design systems?|frontend platform|next\.?js)\b/i.test(title)) return 92;
  if (classification.fullStack) return wantsFrontend ? 78 : 86;
  if (wantsFrontend && classification.genericSoftwareWithoutFrontend) return 48;
  if (/\b(senior)?\s*(software engineer|developer|platform engineer|devex|developer experience|developer tools?|api platform|systems engineer|application engineer)\b/i.test(title)) return 68;
  if (/\b(applied ai|ai engineer|forward deployed engineer|solutions architect|technical lead|documentation engineer)\b/i.test(title)) return wantsFrontend ? 34 : 60;
  if (/\b(engineer|developer|architect|platform|infrastructure|devops|sre|security engineer)\b/i.test(title)) return wantsFrontend ? 36 : 52;
  return 20;
}

function calculateProfileMismatchPenalty(classification: JobSearchTitleClassification, wantsFrontend: boolean, profileText: string, title: string, explicitTitleMatch: boolean) {
  if (!wantsFrontend) return classification.management ? 24 : classification.nonTarget ? 18 : 0;
  let penalty = 0;
  if (classification.management) penalty += 42;
  if (classification.overSenior) penalty += allowsStaffTitle(profileText, title) ? 6 : 28;
  if (classification.backendDataPlatformOnly) penalty += 30;
  if (classification.nonTarget) penalty += 38;
  if (classification.genericSoftwareWithoutFrontend && !explicitTitleMatch) penalty += 18;
  if (classification.fullStack && !classification.frontend) penalty += 34;
  return Math.min(65, penalty);
}

function allowsStaffTitle(profileText: string, title: string) {
  return /\bstaff\b/i.test(profileText) && /\bstaff\b/i.test(title) && !/\b(principal|principle|lead|manager|director|architect|head of)\b/i.test(title);
}

function hasLowLevelSystemsMismatch(haystack: string, profileTitles: string[], required: string[], preferred: string[]) {
  const profileText = [...profileTitles, ...required, ...preferred].join(" ").toLowerCase();
  const explicitlyTargetsLowLevel = lowLevelOrHardwarePattern().test(profileText);
  if (explicitlyTargetsLowLevel) return false;
  return lowLevelOrHardwarePattern().test(haystack);
}

function hasAdjacentTitleMatch(title: string, profileTitle: string) {
  const normalized = normalizeTerm(profileTitle);
  if (normalized.includes("frontend") && /\b(frontend|front-end|ui|web|react|typescript|next\.?js)\b/i.test(title)) return true;
  if (normalized.includes("full stack") && /\b(full.?stack|product engineer)\b/i.test(title)) return true;
  if (normalized.includes("software engineer") && /\b(software engineer|developer|product engineer)\b/i.test(title) && frontendPattern().test(title)) return true;
  if (normalized.includes("developer tools") && /\b(devex|developer|platform|api|sdk|tools?)\b/i.test(title)) return true;
  if (normalized.includes("ai") && /\b(ai|llm|machine learning|ml|applied)\b/i.test(title)) return true;
  return false;
}

function isClearlyNonTargetTitle(title: string) {
  return /\b(intern|new grad|early career|account executive|account manager|sales|recruiter|talent|people partner|customer success|customer support|support engineer|marketing|communications manager|finance|accountant|accounts payable|legal counsel|designer|product manager|program manager|project manager|business development|operations manager|office manager|general manager|market manager|solutions manager|solutions engineer|solutions architect|solution architect|technical account manager|developer advocate|developer relations|devrel|curriculum developer|instructor|transformation manager|applied ai transformation|forward deployed|electrical engineering|electrical engineer|mechanical engineer|hardware engineer|systems safety engineer|aerospace engineer|avionics engineer)\b/i.test(title);
}

function wantsFrontendProfile(profileText: string) {
  return /\b(frontend|front end|front-end|ui|web|react|typescript|design systems?)\b/i.test(profileText);
}

function frontendPattern() {
  return /\b(frontend|front end|front-end|ui|web|react|typescript|javascript|next\.?js|design systems?|component library|storybook|dashboard|data visualization|admin console|product ui|user interface)\b/i;
}

function lowLevelOrHardwarePattern() {
  return /\b(c\+\+|c plus plus|c\s*\/\s*c\+\+|embedded|embedded c|firmware|robotics software|mission autonomy|autonomy software|flight software|air dominance|strike|advanced effects|real-time systems|real time systems|rtos|cuda|electrical engineering|electrical engineer|mechanical engineer|hardware engineer|fpga|avionics|aerospace engineer|controls engineer|guidance navigation|gnc|radar|rf engineer|signal processing|weapons system|weapons systems|vehicle autonomy)\b/i;
}

function normalizeTerm(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

function termAliases(term: string) {
  const aliases: Record<string, string[]> = {
    "fullstack": ["full stack", "full-stack"],
    "full stack": ["fullstack", "full-stack"],
    "next js": ["next.js", "nextjs"],
    "typescript": ["type script"],
    "javascript": ["java script"],
    "api integrations": ["api", "integrations", "api platform"],
    "storybook": ["component library", "design system"],
    "saas": ["enterprise software", "b2b"],
    "identity": ["authentication", "auth", "access management"],
    "security": ["secure", "compliance", "trust"],
  };
  return aliases[term] ?? [];
}

function remoteScore(haystack: string, preference: JobSearchProfile["remotePreference"]) {
  if (preference === "any") return 82;
  if (preference === "hybrid") return haystack.includes("hybrid") ? 90 : 58;
  if (preference === "onsite_relocation") return /relocation|visa|onsite|hybrid/i.test(haystack) ? 84 : 45;
  if (preference === "remote_us_only") return /remote|united states|us only|u\.s\./i.test(haystack) ? 88 : 48;
  if (preference === "remote_global") return /remote|worldwide|global|distributed/i.test(haystack) ? 90 : 52;
  if (preference === "remote_europe") return /remote|europe|emea|eu/i.test(haystack) ? 88 : 50;
  return 65;
}

function relocationScore(haystack: string, preference: JobSearchProfile["relocationPreference"]) {
  if (preference === "unknown" || preference === "not_interested") return 70;
  if (preference === "open_to_relocation") return /relocation|hybrid|onsite/i.test(haystack) ? 82 : 55;
  if (preference === "requires_relocation_support") return /relocation|visa sponsorship|work permit|blue card/i.test(haystack) ? 90 : 42;
  if (preference === "visa_sponsorship_required") return /visa sponsorship|work permit/i.test(haystack) ? 92 : 38;
  if (preference === "eu_blue_card_possible") return /blue card|eu|germany|europe/i.test(haystack) ? 86 : 48;
  return 65;
}

function geographyScore(location: string, profile: JobSearchProfile) {
  const countries = stringArray(profile.countries);
  const normalizedLocation = normalizeTerm(location);
  if (countries.length === 0) {
    if (profile.remotePreference === "remote_global") return /remote|worldwide|global|north america|americas|european union|europe/.test(normalizedLocation) ? 88 : 68;
    return 72;
  }

  if (countries.some((country) => locationMatchesCountry(normalizedLocation, country))) return 92;
  if (profile.remotePreference === "remote_us_only" && /\b(remote|north america|americas|canada)\b/.test(normalizedLocation)) return 72;
  if (profile.remotePreference === "remote_europe" && /\b(remote|europe|european union|emea|eu)\b/.test(normalizedLocation)) return 84;
  if (profile.relocationPreference !== "not_interested" && /\b(europe|european union|emea|eu|hybrid|onsite)\b/.test(normalizedLocation)) return 68;
  return 36;
}

function locationMatchesCountry(location: string, country: string) {
  const normalizedCountry = normalizeTerm(country);
  if (!normalizedCountry) return false;
  if (location.includes(normalizedCountry)) return true;
  const aliases: Record<string, string[]> = {
    "united states": ["united states", "usa", "u s", "us", "remote us", "remote usa", "new york", "san francisco", "seattle", "washington d c", "austin", "boston", "california"],
    "usa": ["united states", "usa", "u s", "us", "remote us", "remote usa", "new york", "san francisco", "seattle", "washington d c", "austin", "boston", "california"],
    "germany": ["germany", "berlin", "munich"],
    "sweden": ["sweden", "stockholm"],
    "luxembourg": ["luxembourg"],
    "netherlands": ["netherlands", "amsterdam"],
    "denmark": ["denmark", "copenhagen"],
    "ireland": ["ireland", "dublin"],
  };
  return (aliases[normalizedCountry] ?? []).some((alias) => location.includes(alias));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
