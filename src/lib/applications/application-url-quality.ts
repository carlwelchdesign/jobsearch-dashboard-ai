export type ApplicationUrlQualityKind =
  | "missing"
  | "invalid"
  | "direct"
  | "listing"
  | "board_intermediary"
  | "auth_or_paywall"
  | "non_application";

export type ApplicationUrlQuality = {
  kind: ApplicationUrlQualityKind;
  launchable: boolean;
  reason: string;
  host: string | null;
  resolvedUrl?: string;
};

export type AtsProviderName =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workday"
  | "workable"
  | "smartrecruiters"
  | "other"
  | "unknown";

const authOrPaywallHosts = new Set([
  "flexjobs.com",
  "glassdoor.com",
  "linkedin.com",
  "remotive.com",
  "wellfound.com",
]);

const intermediaryBoardHosts = new Set([
  "adzuna.com",
  "builtin.com",
  "careerbuilder.com",
  "dice.com",
  "himalayas.app",
  "indeed.com",
  "levels.fyi",
  "monster.com",
  "nodesk.co",
  "remote.co",
  "remoteok.com",
  "remoteok.io",
  "remoterocketship.com",
  "simplyhired.com",
  "trueup.io",
  "workingnomads.com",
  "www.ycombinator.com",
  "ycombinator.com",
  "ziprecruiter.com",
]);

const nonApplicationHostSuffixes = [
  "clarity.ms",
  "doubleclick.net",
  "facebook.net",
  "google-analytics.com",
  "googlesyndication.com",
  "googletagmanager.com",
  "hotjar.com",
  "segment.com",
  "speedtest.net",
];

const listingParamNames = new Set([
  "category",
  "department",
  "jobtitle",
  "location",
  "page",
  "q",
  "query",
  "remote",
  "search",
  "seniority",
  "sort",
]);

export function assessApplicationUrlQuality(value?: string | null): ApplicationUrlQuality {
  if (!value?.trim()) {
    return {
      kind: "missing",
      launchable: false,
      host: null,
      reason: "No application URL is saved.",
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      kind: "invalid",
      launchable: false,
      host: null,
      reason: "Application URL is not a valid URL.",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      kind: "invalid",
      launchable: false,
      host: normalizedHost(url),
      reason: "Application URL must use http or https.",
    };
  }

  const host = normalizedHost(url);
  if (isRecruiteeHostedUrl(host)) {
    return {
      kind: "auth_or_paywall",
      launchable: false,
      host,
      reason: "Recruitee-hosted URLs must resolve to the employer career page first; expired Recruitee links redirect to the Recruitee marketing/paywall site.",
    };
  }

  if (authOrPaywallHosts.has(host)) {
    return {
      kind: "auth_or_paywall",
      launchable: false,
      host,
      reason: `${host} is an authenticated or paywalled job source, not a direct employer application form.`,
    };
  }

  if (intermediaryBoardHosts.has(host)) {
    return {
      kind: "board_intermediary",
      launchable: false,
      host,
      reason: `${host} is a job board/intermediary URL. Resolve it to the employer or ATS application URL before launching Apply Sprint.`,
    };
  }

  if (isNonApplicationHost(host) || isStaticAssetUrl(url)) {
    return {
      kind: "non_application",
      launchable: false,
      host,
      reason: `${host} is not an employer or ATS application target.`,
    };
  }

  if (isLikelyListingUrl(url)) {
    return {
      kind: "listing",
      launchable: false,
      host,
      reason: "This URL looks like a search, listing, or filtered jobs page rather than a single application form.",
    };
  }

  return {
    kind: "direct",
    launchable: true,
    host,
    reason: "Direct employer or ATS application URL.",
    resolvedUrl: url.toString(),
  };
}

export function isLaunchableApplicationUrl(value?: string | null) {
  return assessApplicationUrlQuality(value).launchable;
}

export function requireLaunchableApplicationUrl(value?: string | null) {
  const quality = assessApplicationUrlQuality(value);
  if (!quality.launchable) {
    throw new Error(`Direct application URL required. ${quality.reason}`);
  }
  return quality;
}

export function applicationUrlQualityReason(value?: string | null) {
  return assessApplicationUrlQuality(value).reason;
}

export function atsProviderFromApplicationUrl(value?: string | null): AtsProviderName {
  if (!value) return "unknown";
  const normalized = value.toLowerCase();
  if (/greenhouse/.test(normalized)) return "greenhouse";
  if (/lever/.test(normalized)) return "lever";
  if (/ashby/.test(normalized)) return "ashby";
  if (/workdayjobs|myworkdayjobs/.test(normalized)) return "workday";
  if (/smartrecruiters/.test(normalized)) return "smartrecruiters";
  if (/workable/.test(normalized)) return "workable";
  return "other";
}

function normalizedHost(url: URL) {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function isNonApplicationHost(host: string) {
  return nonApplicationHostSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function isRecruiteeHostedUrl(host: string) {
  return host === "recruitee.com" || host.endsWith(".recruitee.com");
}

function isStaticAssetUrl(url: URL) {
  return /\.(?:css|gif|ico|jpe?g|js|png|svg|webp)(?:$|\?)/i.test(url.pathname);
}

function isLikelyListingUrl(url: URL) {
  const path = url.pathname.toLowerCase();
  if (/\/(?:apply|application|form)(?:\/|$)/i.test(path)) return false;

  const listingParamMatches = Array.from(url.searchParams.keys())
    .filter((key) => listingParamNames.has(key.toLowerCase()))
    .length;

  if (listingParamMatches >= 2) return true;
  if (/\/(search|job-search|jobs\/search)\b/i.test(path)) return true;
  if (/\/(jobs|careers|open-roles|positions)\/(search|remote|engineering|software|frontend|front-end|developer|dev-engineering)\b/i.test(path)) return true;
  if (/^\/(?:jobs|careers|open-roles|positions)\/?$/i.test(path) && listingParamMatches >= 1) return true;
  return false;
}
