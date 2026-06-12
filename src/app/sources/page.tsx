export const metadata = {
  title: "Sources | Job Search OS",
  description: "Manage job sources, company policies, and discovery channels.",
};

import SourceOutlinedIcon from "@mui/icons-material/SourceOutlined";
import TravelExploreOutlinedIcon from "@mui/icons-material/TravelExploreOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { RunSearchControl } from "@/components/run-search-control";
import { StatusChip } from "@/components/ui/status-chip";
import { configToPrismaJson, defaultCompanySourceConfig, normalizeCompanySourceConfig } from "@/lib/job-search/company-source-config";
import { defaultSearchQuerySourceConfig, mergeSearchQuerySourceConfig, sourceCatalog } from "@/lib/job-search/source-catalog";
import { prisma } from "@/lib/prisma";
import { AddCompanySourceForm } from "./add-company-source-form";
import { AddJobSourceForm } from "./add-job-source-form";
import { CompanySourceSettings } from "./company-source-settings";
import { getServiceFallbacks } from "@/lib/service-fallbacks";
import { ServiceFallbackBanners } from "@/components/ui/service-fallback-banners";

export const dynamic = "force-dynamic";

export default async function SourcesPage({ searchParams }: { searchParams?: { q?: string; category?: string; priority?: string } }) {
  const [source, rawSearchQuerySource, jobSources] = await prisma.$transaction([
    prisma.jobSource.upsert({
      where: { type_name: { type: "company_site", name: "Company Source List" } },
      update: {},
      create: {
        name: "Company Source List",
        type: "company_site",
        enabled: true,
        config: configToPrismaJson(defaultCompanySourceConfig()),
      },
    }),
    prisma.jobSource.upsert({
      where: { type_name: { type: "search_query", name: "Search Query Backlog" } },
      update: {},
      create: {
        name: "Search Query Backlog",
        type: "search_query",
        baseUrl: "https://search.brave.com",
        enabled: Boolean(process.env.BRAVE_SEARCH_API_KEY),
        config: defaultSearchQuerySourceConfig(),
      },
    }),
    prisma.jobSource.findMany(),
  ]);
  const mergedSearchQueryConfig = mergeSearchQuerySourceConfig(rawSearchQuerySource.config);
  const searchQuerySource = JSON.stringify(rawSearchQuerySource.config) === JSON.stringify(mergedSearchQueryConfig)
    ? rawSearchQuerySource
    : await prisma.jobSource.update({
        where: { id: rawSearchQuerySource.id },
        data: { baseUrl: "https://search.brave.com", config: mergedSearchQueryConfig },
      });
  const config = normalizeCompanySourceConfig(source.config);
  const query = searchParams?.q?.trim().toLowerCase() ?? "";
  const category = searchParams?.category?.trim() ?? "";
  const priority = Number(searchParams?.priority ?? 0);
  const categories = Array.from(new Set(config.companies.flatMap((company) => company.categories))).sort();
  const visibleCompanies = config.companies.filter((company) => {
    const haystack = `${company.name} ${company.categories.join(" ")} ${company.searchTerms.join(" ")}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesCategory = !category || company.categories.includes(category);
    const matchesPriority = !priority || company.priority === priority;
    return matchesQuery && matchesCategory && matchesPriority;
  });
  const priorityCounts = [1, 2, 3].map((item) => ({
    priority: item,
    count: config.companies.filter((company) => company.priority === item).length,
  }));
  const sourceCatalogCounts = {
    implemented: sourceCatalog.filter((item) => item.status === "active").length,
    enabled: jobSources.filter((item) => item.enabled && item.type !== "manual").length,
    planned: sourceCatalog.filter((item) => item.status === "planned").length,
    manual: sourceCatalog.filter((item) => item.status === "manual").length,
    priorityOne: sourceCatalog.filter((item) => item.priority === 1).length,
  };
  const hasBraveSearchKey = Boolean(process.env.BRAVE_SEARCH_API_KEY);
  const searchQueryConfigured = searchQuerySource.enabled && hasBraveSearchKey;
  const searchQueryConfig = mergeSearchQuerySourceConfig(searchQuerySource.config);
  const configuredSearchQueries = Array.isArray(searchQueryConfig.queries) ? searchQueryConfig.queries : [];
  const searchQueryDomains = Array.from(new Set(configuredSearchQueries.flatMap((item) => (
    Array.from(item.matchAll(/\bsite:([^\s"']+)/gi)).flatMap((match) => {
      const domain = (match[1] ?? "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
      return domain ? [domain] : [];
    })
  )))).sort();
  const visibleCatalog = sourceCatalog
    .slice()
    .sort((left, right) => left.priority - right.priority || statusRank(left.status) - statusRank(right.status) || left.name.localeCompare(right.name));
  const nextAction = sourcesNextAction({
    enabled: source.enabled,
    companyCount: config.companies.length,
    priorityOneCount: priorityCounts[0]?.count ?? 0,
  });

  const fallbacks = getServiceFallbacks(["brave"]);

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Source management"
          title="Company Sources"
          description="Manage curated company sources and broad open-web provider coverage. LinkedIn is treated as a discovery signal: the app does not scrape LinkedIn directly, but it searches for original employer, ATS, and career-page postings behind LinkedIn-visible roles."
        />
        <ServiceFallbackBanners items={fallbacks} />

        <Card sx={{ borderColor: nextAction.color === "warning" ? "warning.main" : "primary.main", bgcolor: nextAction.color === "warning" ? "rgba(245, 158, 11, 0.08)" : "rgba(37, 99, 235, 0.08)" }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color={nextAction.color} label="Next action" />
                  {typeof nextAction.count === "number" ? <Chip size="small" variant="outlined" label={nextAction.count} /> : null}
                </Stack>
                <Typography variant="h3">{nextAction.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{nextAction.detail}</Typography>
              </Box>
              {nextAction.kind === "search" ? (
                <RunSearchControl compact />
              ) : (
                <Button href={nextAction.href} variant="contained" color={nextAction.color} startIcon={nextAction.icon}>
                  {nextAction.label}
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
          <Metric label="Status" value={<StatusChip status={source.enabled ? "configured" : "provider_missing"} />} helper={source.enabled ? "Included in search runs" : "Paused"} />
          <Metric label="Companies" value={config.companies.length.toString()} helper={`${visibleCompanies.length} visible with current filters`} />
          <Metric label="Priority ceiling" value={config.priorityMax.toString()} helper="Lower is more targeted" />
          <Metric label="Max fetched" value={config.maxFetch.toString()} helper={`${config.maxCompanies} companies per run`} />
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                <Box>
                  <Typography variant="h3">Source roadmap</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Prioritized source registry for board, ATS, marketplace, community, newsletter, and search-query connectors. Implemented sources have working adapters; enabled sources are included in search runs.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Chip variant="outlined" label={`${sourceCatalogCounts.implemented} implemented`} />
                  <Chip color="success" variant="outlined" label={`${sourceCatalogCounts.enabled} enabled`} />
                  <Chip variant="outlined" label={`${sourceCatalogCounts.planned} planned`} />
                  <Chip variant="outlined" label={`${sourceCatalogCounts.manual} manual`} />
                  <Chip color="primary" variant="outlined" label={`${sourceCatalogCounts.priorityOne} P1`} />
                </Stack>
              </Stack>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5 }}>
                {visibleCatalog.slice(0, 24).map((item) => (
                  <Box key={`${item.category}-${item.name}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 900 }}>{item.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{formatCatalogLabel(item.category)} · {item.connector}</Typography>
                        </Box>
                        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                          <Chip size="small" color={item.priority === 1 ? "success" : item.priority === 2 ? "primary" : "default"} label={`P${item.priority}`} />
                          <Chip size="small" variant="outlined" label={item.status} />
                        </Stack>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">{item.notes}</Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                        {item.regions.slice(0, 4).map((region) => <Chip key={`${item.name}-${region}`} size="small" variant="outlined" label={region} />)}
                        {item.supportsRemote ? <Chip size="small" color="success" variant="outlined" label="Remote" /> : null}
                        {item.authRequired ? <Chip size="small" color="warning" variant="outlined" label="Auth" /> : null}
                        <Chip size="small" variant="outlined" label={`${item.scrapingDifficulty} scrape`} />
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h3">Search-query backlog</Typography>
                <Typography variant="body2" color="text.secondary">
                  {searchQueryConfigured
                    ? `Targeted open-web queries are active and will run through the Brave Search connector during search runs. Current coverage includes ${configuredSearchQueries.length} query templates across ${searchQueryDomains.length} provider domain(s).`
                    : hasBraveSearchKey
                      ? "BRAVE_SEARCH_API_KEY is configured, but the `Search Query Backlog` source is disabled."
                      : searchQuerySource.enabled
                        ? `The Search Query Backlog source is enabled, but BRAVE_SEARCH_API_KEY is not configured for the running server. ${configuredSearchQueries.length} provider query templates are configured but cannot run.`
                        : "Targeted open-web queries require the `Search Query Backlog` source to be enabled and BRAVE_SEARCH_API_KEY to be configured."}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  LinkedIn jobs should be captured through their original company or ATS pages when possible; this backlog broadens discovery across ATS partners and job boards without account scraping.
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  Search charts now separate raw fetched volume from detail candidates, qualified matches, new profile matches, agency-eligible jobs, and review-only broad matches so source coverage gains do not look like silent failures.
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                <StatusChip status={searchQueryConfigured ? "configured" : "provider_missing"} />
                <Chip variant="outlined" label={hasBraveSearchKey ? "Brave key configured" : "Brave key missing"} />
                <Chip variant="outlined" label={searchQuerySource.enabled ? "Source enabled" : "Source disabled"} />
                <Chip variant="outlined" label={`${configuredSearchQueries.length} queries`} />
                <Chip variant="outlined" label={`${searchQueryDomains.length} domains`} />
              </Stack>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1 }}>
                {configuredSearchQueries.map((query) => (
                  <Box key={query} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1, bgcolor: "background.paper" }}>
                    <Typography variant="body2" sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>{query}</Typography>
                  </Box>
                ))}
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card id="source-settings">
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <SourceOutlinedIcon color="primary" />
                <Typography variant="h3">Run settings</Typography>
              </Stack>
              <CompanySourceSettings
                enabled={source.enabled}
                priorityMax={config.priorityMax}
                maxCompanies={config.maxCompanies}
                maxJobsPerCompany={config.maxJobsPerCompany}
                maxFetch={config.maxFetch}
              />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Box>
                <Typography variant="h3">Add job board source</Typography>
                <Typography variant="body2" color="text.secondary">
                  Add supported niche job boards such as JobFront-powered defense, startup, or portfolio boards.
                </Typography>
              </Box>
              <AddJobSourceForm />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                <Box>
                  <Typography variant="h3">Company list</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Priority 1 companies are searched first. Categories and search terms guide role filtering after ATS feeds return jobs.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {priorityCounts.map((item) => <Chip key={item.priority} variant="outlined" label={`P${item.priority}: ${item.count}`} />)}
                </Stack>
              </Stack>

              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2, bgcolor: "background.paper" }}>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="h3">Add company</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Add a direct company source for Greenhouse, Lever, Ashby, or generated ATS slug probing.
                    </Typography>
                  </Box>
                  <AddCompanySourceForm categories={categories} />
                </Stack>
              </Box>

              <Box component="form" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 1fr" }, gap: 1.5 }}>
                <input aria-label="Search companies, categories, or terms" name="q" defaultValue={searchParams?.q ?? ""} placeholder="Search companies, categories, or terms" style={inputStyle} />
                <select aria-label="Filter company sources by category" name="category" defaultValue={category} style={inputStyle}>
                  <option value="">All categories</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select aria-label="Filter company sources by priority" name="priority" defaultValue={priority ? String(priority) : ""} style={inputStyle}>
                  <option value="">All priorities</option>
                  <option value="1">Priority 1</option>
                  <option value="2">Priority 2</option>
                  <option value="3">Priority 3</option>
                </select>
              </Box>

              {visibleCompanies.length === 0 ? (
                <EmptyState title="No companies match those filters" body="Clear the search, category, or priority filter to see the source list." />
              ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 1.5 }}>
                  {visibleCompanies.slice(0, 120).map((company) => (
                    <Box key={company.name} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1.5, bgcolor: "background.paper" }}>
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                          <Box>
                            <Typography sx={{ fontWeight: 900 }}>{company.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{company.careersQuery}</Typography>
                          </Box>
                          <Chip size="small" color={company.priority === 1 ? "success" : company.priority === 2 ? "primary" : "default"} label={`P${company.priority}`} />
                        </Stack>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                          {company.categories.slice(0, 6).map((item) => <Chip key={`${company.name}-${item}`} size="small" variant="outlined" label={item} />)}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {company.searchTerms.slice(0, 5).join(", ")}
                        </Typography>
                      </Stack>
                    </Box>
                  ))}
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </AppShell>
  );
}

function sourcesNextAction({ enabled, companyCount, priorityOneCount }: { enabled: boolean; companyCount: number; priorityOneCount: number }) {
  if (!enabled) {
    return {
      kind: "link",
      title: "Enable company-source discovery",
      detail: "The curated company source list is paused. Enable it before expecting direct careers-page and ATS feed searches.",
      label: "Review settings",
      href: "#source-settings",
      color: "warning" as const,
      icon: <SourceOutlinedIcon />,
      count: companyCount,
    };
  }
  if (companyCount === 0) {
    return {
      kind: "link",
      title: "Seed company sources",
      detail: "No companies are configured. Add or restore the curated source list before running discovery.",
      label: "Review settings",
      href: "#source-settings",
      color: "warning" as const,
      icon: <SourceOutlinedIcon />,
      count: 0,
    };
  }
  return {
    kind: "search",
    title: "Run company-source discovery",
    detail: `Search direct company sources, starting with ${priorityOneCount} priority-one companies and the active search profiles.`,
    label: "Run search",
    color: "primary" as const,
    icon: <TravelExploreOutlinedIcon />,
    count: companyCount,
  };
}

function Metric({ label, value, helper }: { label: string; value: React.ReactNode; helper: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Box sx={{ mt: 0.75, fontWeight: 900 }}>{value}</Box>
        <Typography variant="caption" color="text.secondary">{helper}</Typography>
      </CardContent>
    </Card>
  );
}

function statusRank(status: string) {
  if (status === "active") return 0;
  if (status === "planned") return 1;
  if (status === "manual") return 2;
  if (status === "blocked") return 3;
  return 4;
}

function formatCatalogLabel(value: string) {
  return value.replace(/_/g, " ");
}

const inputStyle = {
  border: "1px solid #d7d1c3",
  borderRadius: 8,
  font: "inherit",
  padding: "10px 12px",
  minHeight: 42,
  background: "#fff",
};
