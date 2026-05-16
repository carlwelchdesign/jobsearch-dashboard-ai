export type SourceCatalogItem = {
  name: string;
  category: SourceCatalogCategory;
  priority: 1 | 2 | 3 | 4 | 5;
  status: "active" | "planned" | "manual" | "blocked" | "legacy";
  connector: "direct_ats" | "company_source" | "rss" | "api" | "html" | "search_query" | "manual_review" | "marketplace";
  regions: string[];
  roles: string[];
  supportsRemote: boolean;
  authRequired: boolean;
  scrapingDifficulty: "low" | "medium" | "high" | "blocked";
  recommendedCadence: "hourly" | "daily" | "weekly" | "monthly";
  notes: string;
};

export type SourceCatalogCategory =
  | "general_job_board"
  | "remote_job_board"
  | "tech_job_board"
  | "startup_board"
  | "ats_platform"
  | "company_careers_page"
  | "vc_portfolio_jobs"
  | "government_defense"
  | "recruiter_marketplace"
  | "freelance_marketplace"
  | "community"
  | "newsletter"
  | "search_engine_query"
  | "regional_board"
  | "industry_niche_board";

const seniorEngineeringRoles = ["frontend", "fullstack", "product-engineering", "developer-tools", "security", "ai"];
const global = ["US", "Canada", "Europe", "Global"];

export const sourceCatalog: SourceCatalogItem[] = [
  source("Greenhouse", "ats_platform", 1, "active", "direct_ats", global, seniorEngineeringRoles, true, false, "low", "daily", "Direct API-backed ATS adapter is active."),
  source("Lever", "ats_platform", 1, "active", "direct_ats", global, seniorEngineeringRoles, true, false, "low", "daily", "Direct API-backed ATS adapter is active."),
  source("Ashby", "ats_platform", 1, "active", "direct_ats", global, seniorEngineeringRoles, true, false, "low", "daily", "Direct API-backed ATS adapter is active."),
  source("Company Source List", "company_careers_page", 1, "active", "company_source", global, seniorEngineeringRoles, true, false, "medium", "daily", "Curated company list probes Greenhouse, Lever, and Ashby slugs directly."),
  source("Workday", "ats_platform", 1, "planned", "html", global, seniorEngineeringRoles, true, false, "high", "daily", "High-value ATS, but tenant-specific URLs and anti-automation need careful handling."),
  source("SmartRecruiters", "ats_platform", 1, "planned", "api", global, seniorEngineeringRoles, true, false, "medium", "daily", "Prioritize after direct ATS coverage."),
  source("iCIMS", "ats_platform", 2, "planned", "html", ["US", "Europe"], seniorEngineeringRoles, true, false, "high", "daily", "Common enterprise ATS with inconsistent career-page formats."),
  source("Jobvite", "ats_platform", 2, "planned", "html", ["US", "Europe"], seniorEngineeringRoles, true, false, "medium", "daily", "Useful for mid-market SaaS and security companies."),
  source("BambooHR", "ats_platform", 2, "planned", "html", ["US", "Europe"], seniorEngineeringRoles, true, false, "medium", "daily", "Often used by smaller startups."),
  source("Workable", "ats_platform", 2, "planned", "api", global, seniorEngineeringRoles, true, false, "medium", "daily", "Good startup and Europe coverage."),
  source("Recruitee", "ats_platform", 2, "planned", "api", ["Europe", "Global"], seniorEngineeringRoles, true, false, "medium", "daily", "Good Europe startup coverage."),
  source("Teamtailor", "ats_platform", 2, "planned", "api", ["Europe", "Global"], seniorEngineeringRoles, true, false, "medium", "daily", "Good Europe and design-forward startup coverage."),
  source("Personio", "ats_platform", 2, "planned", "html", ["Europe"], seniorEngineeringRoles, true, false, "medium", "daily", "Important for Germany and EU relocation searches."),

  source("We Work Remotely", "remote_job_board", 1, "active", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Adapter exists but is paused by default due board friction and lower precision."),
  source("Remote OK", "remote_job_board", 2, "active", "api", global, seniorEngineeringRoles, true, false, "low", "daily", "Adapter exists but is paused by default because listing quality has been noisy."),
  source("Remote.co", "remote_job_board", 2, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Remote-first roles."),
  source("Remotive", "remote_job_board", 2, "planned", "rss", global, seniorEngineeringRoles, true, false, "low", "daily", "Good candidate for RSS/API ingestion."),
  source("NoDesk", "remote_job_board", 2, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Remote tech and product roles."),
  source("Himalayas", "remote_job_board", 2, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Remote-friendly company and job data."),
  source("Working Nomads", "remote_job_board", 3, "planned", "rss", global, seniorEngineeringRoles, true, false, "low", "daily", "Useful remote feed."),
  source("FlexJobs", "remote_job_board", 3, "manual", "manual_review", global, seniorEngineeringRoles, true, true, "blocked", "weekly", "Paid/authenticated source, better as manual import unless account automation is added."),

  source("Wellfound", "startup_board", 1, "planned", "html", global, seniorEngineeringRoles, true, true, "high", "daily", "High-value startup source, but auth/rate limits need explicit connector work."),
  source("Y Combinator Work at a Startup", "startup_board", 1, "planned", "api", global, seniorEngineeringRoles, true, false, "medium", "daily", "High leverage for startup engineering roles."),
  source("Built In", "tech_job_board", 1, "planned", "html", ["US"], seniorEngineeringRoles, true, false, "medium", "daily", "Strong US tech and remote indexes."),
  source("Levels.fyi Jobs", "tech_job_board", 2, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Good senior comp-aware source."),
  source("TrueUp", "tech_job_board", 2, "planned", "html", ["US", "Global"], seniorEngineeringRoles, true, false, "medium", "daily", "Good layoff-aware tech jobs source."),
  source("Dice", "tech_job_board", 3, "planned", "html", ["US"], seniorEngineeringRoles, true, false, "high", "weekly", "Large tech board but noisy; use after higher-signal sources."),
  source("Hacker News Who is Hiring", "community", 2, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "monthly", "Monthly thread source with strong startup signal."),

  source("a16z Portfolio Jobs", "vc_portfolio_jobs", 1, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "High-yield portfolio aggregator."),
  source("Sequoia Jobs", "vc_portfolio_jobs", 1, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "High-yield portfolio aggregator."),
  source("Y Combinator Company Directory", "vc_portfolio_jobs", 1, "planned", "api", global, seniorEngineeringRoles, true, false, "medium", "weekly", "Use to discover companies, then probe ATS directly."),
  source("General Catalyst Jobs", "vc_portfolio_jobs", 2, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Portfolio job aggregator."),
  source("Greylock Jobs", "vc_portfolio_jobs", 2, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Portfolio job aggregator."),
  source("Index Ventures Jobs", "vc_portfolio_jobs", 2, "planned", "html", ["US", "Europe"], seniorEngineeringRoles, true, false, "medium", "daily", "Good Europe and startup coverage."),
  source("Bessemer Venture Partners Jobs", "vc_portfolio_jobs", 2, "planned", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Portfolio job aggregator."),

  source("ClearanceJobs", "government_defense", 2, "manual", "manual_review", ["US"], ["defense", "security", "software"], false, true, "blocked", "weekly", "Useful only if clearance constraints fit; many roles require active clearance."),
  source("USAJOBS", "government_defense", 3, "planned", "api", ["US"], ["software", "security", "public-sector"], false, false, "medium", "weekly", "Official federal source; lower priority unless public-sector strategy is active."),
  source("ClearedJobs.Net", "government_defense", 3, "manual", "manual_review", ["US"], ["defense", "security", "software"], false, true, "blocked", "weekly", "Mostly clearance-gated."),

  source("Hired", "recruiter_marketplace", 2, "manual", "marketplace", global, seniorEngineeringRoles, true, true, "blocked", "weekly", "Candidate marketplace, not a scrape target."),
  source("Otta / Welcome to the Jungle", "recruiter_marketplace", 2, "manual", "marketplace", ["US", "Europe", "Global"], seniorEngineeringRoles, true, true, "blocked", "weekly", "Useful marketplace, but should be handled as account workflow."),
  source("Cord", "recruiter_marketplace", 3, "manual", "marketplace", ["Europe"], seniorEngineeringRoles, true, true, "blocked", "weekly", "Europe talent marketplace."),
  source("Toptal", "freelance_marketplace", 4, "manual", "marketplace", global, ["contract", "frontend", "fullstack"], true, true, "blocked", "weekly", "Emergency/fractional income source, not core full-time search."),
  source("Braintrust", "freelance_marketplace", 4, "manual", "marketplace", global, ["contract", "frontend", "fullstack"], true, true, "blocked", "weekly", "Contract marketplace."),

  source("LinkedIn Jobs", "general_job_board", 3, "manual", "manual_review", global, seniorEngineeringRoles, true, true, "blocked", "daily", "Major source but requires account/session workflow and careful ToS handling."),
  source("Indeed", "general_job_board", 4, "manual", "manual_review", global, seniorEngineeringRoles, true, false, "blocked", "weekly", "Large volume, high noise, blocked scraping risk."),
  source("Google Jobs", "general_job_board", 3, "manual", "search_query", global, seniorEngineeringRoles, true, false, "blocked", "daily", "Use through browser/search workflow, not direct scraping."),
  source("Glassdoor", "general_job_board", 4, "manual", "manual_review", global, seniorEngineeringRoles, true, true, "blocked", "weekly", "High noise and auth friction."),

  source("Targeted ATS search queries", "search_engine_query", 1, "planned", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Query patterns like site:jobs.ashbyhq.com React TypeScript remote."),
  source("VC portfolio discovery queries", "search_engine_query", 2, "planned", "search_query", global, seniorEngineeringRoles, true, false, "medium", "weekly", "Find portfolio career pages, then add companies to direct ATS probing."),
  source("Reactiflux / Frontend communities", "community", 4, "manual", "manual_review", global, ["frontend", "react", "typescript"], true, true, "blocked", "weekly", "Human-review community source."),
  source("TLDR Jobs / newsletter feeds", "newsletter", 4, "manual", "manual_review", global, seniorEngineeringRoles, true, false, "medium", "weekly", "Useful as manual/email ingestion source later."),
];

export const searchQueryTemplates = [
  'site:jobs.ashbyhq.com "Senior Frontend Engineer" "remote"',
  'site:boards.greenhouse.io "Staff Frontend Engineer" "React" "TypeScript"',
  'site:jobs.lever.co "Product Engineer" "AI" "remote"',
  'site:workdayjobs.com "React" "remote" "Senior"',
  'site:smartrecruiters.com "Frontend Engineer" "United States"',
  '"Senior Frontend Engineer" "React" "TypeScript" "remote" "salary"',
  '"Staff Software Engineer" "design systems" "remote"',
  '"Developer Experience Engineer" "React" "TypeScript"',
  '"WebAuthn" "Frontend Engineer" "remote"',
  '"Mission Software Engineer" "React" "TypeScript"',
];

function source(
  name: string,
  category: SourceCatalogCategory,
  priority: SourceCatalogItem["priority"],
  status: SourceCatalogItem["status"],
  connector: SourceCatalogItem["connector"],
  regions: string[],
  roles: string[],
  supportsRemote: boolean,
  authRequired: boolean,
  scrapingDifficulty: SourceCatalogItem["scrapingDifficulty"],
  recommendedCadence: SourceCatalogItem["recommendedCadence"],
  notes: string,
): SourceCatalogItem {
  return {
    name,
    category,
    priority,
    status,
    connector,
    regions,
    roles,
    supportsRemote,
    authRequired,
    scrapingDifficulty,
    recommendedCadence,
    notes,
  };
}
