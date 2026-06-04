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
  source("Workday", "ats_platform", 1, "active", "search_query", global, seniorEngineeringRoles, true, false, "high", "daily", "Covered through Brave Search query templates while tenant-specific URLs and anti-automation are handled conservatively."),
  source("SmartRecruiters", "ats_platform", 1, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates until a dedicated API connector is added."),
  source("iCIMS", "ats_platform", 2, "active", "search_query", ["US", "Europe"], seniorEngineeringRoles, true, false, "high", "daily", "Covered through Brave Search query templates for inconsistent enterprise career-page formats."),
  source("Jobvite", "ats_platform", 2, "active", "search_query", ["US", "Europe"], seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates until a dedicated connector is added."),
  source("BambooHR", "ats_platform", 2, "active", "search_query", ["US", "Europe"], seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for startup career pages."),
  source("Workable", "ats_platform", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates until a dedicated API connector is added."),
  source("Recruitee", "ats_platform", 2, "active", "search_query", ["Europe", "Global"], seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for Europe startup coverage."),
  source("Teamtailor", "ats_platform", 2, "active", "search_query", ["Europe", "Global"], seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates until a dedicated API connector is added."),
  source("Personio", "ats_platform", 2, "active", "search_query", ["Europe"], seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for EU relocation searches."),

  source("We Work Remotely", "remote_job_board", 1, "active", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Adapter exists but is paused by default due board friction and lower precision."),
  source("Remote OK", "remote_job_board", 2, "active", "api", global, seniorEngineeringRoles, true, false, "low", "daily", "Adapter exists but is paused by default because listing quality has been noisy."),
  source("Remote.co", "remote_job_board", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for remote-first roles."),
  source("Remotive", "remote_job_board", 2, "blocked", "manual_review", global, seniorEngineeringRoles, true, true, "blocked", "weekly", "Blocked because current listings are paywall-gated; keep out of automated query ingestion."),
  source("NoDesk", "remote_job_board", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for remote tech and product roles."),
  source("Himalayas", "remote_job_board", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for remote-friendly company and job data."),
  source("Working Nomads", "remote_job_board", 3, "active", "search_query", global, seniorEngineeringRoles, true, false, "low", "daily", "Covered through Brave Search query templates until RSS ingestion is added."),
  source("FlexJobs", "remote_job_board", 3, "manual", "manual_review", global, seniorEngineeringRoles, true, true, "blocked", "weekly", "Paid/authenticated source, better as manual import unless account automation is added."),

  source("Wellfound", "startup_board", 1, "active", "search_query", global, seniorEngineeringRoles, true, true, "high", "daily", "Covered through Brave Search query templates; account workflow remains manual."),
  source("Y Combinator Work at a Startup", "startup_board", 1, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for startup engineering roles."),
  source("Built In", "tech_job_board", 1, "active", "search_query", ["US"], seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for US tech and remote indexes."),
  source("Levels.fyi Jobs", "tech_job_board", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for senior comp-aware roles."),
  source("TrueUp", "tech_job_board", 2, "active", "search_query", ["US", "Global"], seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for layoff-aware tech jobs."),
  source("Dice", "tech_job_board", 3, "active", "search_query", ["US"], seniorEngineeringRoles, true, false, "high", "weekly", "Covered through Brave Search query templates; kept lower priority because it is noisy."),
  source("Hacker News Who is Hiring", "community", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "monthly", "Covered through Brave Search query templates for monthly startup signal."),

  source("a16z Portfolio Jobs", "vc_portfolio_jobs", 1, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for portfolio aggregator roles."),
  source("Sequoia Jobs", "vc_portfolio_jobs", 1, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for portfolio aggregator roles."),
  source("Y Combinator Company Directory", "vc_portfolio_jobs", 1, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "weekly", "Covered through Brave Search query templates to discover companies before ATS probing."),
  source("General Catalyst Jobs", "vc_portfolio_jobs", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for portfolio aggregator roles."),
  source("Greylock Jobs", "vc_portfolio_jobs", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for portfolio aggregator roles."),
  source("Index Ventures Jobs", "vc_portfolio_jobs", 2, "active", "search_query", ["US", "Europe"], seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for Europe and startup coverage."),
  source("Bessemer Venture Partners Jobs", "vc_portfolio_jobs", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Covered through Brave Search query templates for portfolio aggregator roles."),

  source("ClearanceJobs", "government_defense", 2, "manual", "manual_review", ["US"], ["defense", "security", "software"], false, true, "blocked", "weekly", "Useful only if clearance constraints fit; many roles require active clearance."),
  source("USAJOBS", "government_defense", 3, "active", "search_query", ["US"], ["software", "security", "public-sector"], false, false, "medium", "weekly", "Covered through Brave Search query templates for public-sector software roles."),
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

  source("Targeted ATS search queries", "search_engine_query", 1, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "daily", "Brave Search-backed connector runs configured query patterns when the provider key is available."),
  source("JobFront Boards", "industry_niche_board", 1, "active", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Public JobFront board connector supports niche boards such as Defense Tech Jobs."),
  source("Eightfold Careers", "company_careers_page", 1, "active", "html", global, seniorEngineeringRoles, true, false, "medium", "daily", "Public Eightfold career pages can be read through their jobs endpoint, with embedded smartApplyData as fallback."),
  source("VC portfolio discovery queries", "search_engine_query", 2, "active", "search_query", global, seniorEngineeringRoles, true, false, "medium", "weekly", "Brave Search query templates find portfolio career pages, then companies can be added to direct ATS probing."),
  source("Reactiflux / Frontend communities", "community", 4, "manual", "manual_review", global, ["frontend", "react", "typescript"], true, true, "blocked", "weekly", "Human-review community source."),
  source("TLDR Jobs / newsletter feeds", "newsletter", 4, "manual", "manual_review", global, seniorEngineeringRoles, true, false, "medium", "weekly", "Useful as manual/email ingestion source later."),
];

export const searchQueryTemplates = [
  'site:jobs.ashbyhq.com "Senior Frontend Engineer" "remote"',
  'site:boards.greenhouse.io "Staff Frontend Engineer" "React" "TypeScript"',
  'site:jobs.lever.co "Product Engineer" "AI" "remote"',
  'site:workdayjobs.com "React" "remote" "Senior"',
  'site:smartrecruiters.com "Frontend Engineer" "United States"',
  'site:jobs.smartrecruiters.com "Senior Frontend Engineer" "remote"',
  'site:icims.com "Frontend Engineer" "React" "remote"',
  'site:jobs.jobvite.com "Frontend Engineer" "TypeScript" "remote"',
  'site:jobs.bamboohr.com "Senior Frontend Engineer" "remote"',
  'site:jobs.workable.com "Frontend Engineer" "React" "remote"',
  'site:recruitee.com "Senior Frontend Engineer" "remote"',
  'site:jobs.teamtailor.com "Frontend Engineer" "TypeScript" "remote"',
  'site:jobs.personio.com "Frontend Engineer" "React" "remote"',
  'site:remote.co "Frontend Engineer" "React" "TypeScript"',
  'site:nodesk.co "Frontend Engineer" "remote"',
  'site:himalayas.app "Frontend Engineer" "React" "remote"',
  'site:workingnomads.com "Frontend Engineer" "TypeScript"',
  'site:wellfound.com/jobs "Frontend Engineer" "React" "remote"',
  'site:ycombinator.com/jobs "Frontend Engineer" "React" "remote"',
  'site:builtin.com/jobs "Senior Frontend Engineer" "remote"',
  'site:levels.fyi/jobs "Frontend Engineer" "React" "remote"',
  'site:trueup.io/jobs "Frontend Engineer" "TypeScript" "remote"',
  'site:dice.com "Frontend Engineer" "React" "remote"',
  'site:news.ycombinator.com "Who is hiring" "Frontend Engineer" "remote"',
  'site:jobs.a16z.com "Frontend Engineer" "React" "remote"',
  'site:jobs.sequoiacap.com "Frontend Engineer" "React" "remote"',
  'site:jobs.generalcatalyst.com "Frontend Engineer" "remote"',
  'site:jobs.greylock.com "Frontend Engineer" "remote"',
  'site:jobs.indexventures.com "Frontend Engineer" "remote"',
  'site:jobs.bvp.com "Frontend Engineer" "React" "remote"',
  'site:usajobs.gov "Frontend" "Software Engineer" "remote"',
  'site:job-boards.greenhouse.io/anthropic "Software Engineer, Claude Design"',
  'site:job-boards.greenhouse.io/anthropic "Staff UI Software Engineer" "React"',
  'site:job-boards.greenhouse.io/anthropic "Design Engineer, Web"',
  'site:job-boards.greenhouse.io/anthropic "Staff Software Engineer, Accessibility"',
  'site:explore.jobs.netflix.net/careers "Frontend Engineer" "React"',
  'site:explore.jobs.netflix.net/careers "Software Engineer" "remote"',
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
