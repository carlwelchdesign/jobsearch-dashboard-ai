export const metadata = {
  title: "Search Profiles | Job Search OS",
  description: "Manage search profiles and discovery strategy.",
};

import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import ExploreOutlinedIcon from "@mui/icons-material/ExploreOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/ui/page-header";
import { ScoreChip } from "@/components/ui/score-chip";
import { formatStatus } from "@/components/ui/status-chip";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { ProfileCreateForm } from "./profile-create-form";
import { ProfileActions } from "./profile-actions";
import { ProfileSuggestionPanel } from "./profile-suggestion-panel";
import { ProfileOptimizerPanel } from "./profile-optimizer-panel";
import type { OptimizerOutput } from "./profile-optimizer-panel";
import { ProfileRebuildPanel } from "./profile-rebuild-panel";
import { SearchExpansionPanel } from "./search-expansion-panel";
import type { SearchExpansionPanelOutput } from "./search-expansion-panel";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const [profiles, latestOptimizerRun, latestExpansionRun] = await Promise.all([
    prisma.jobSearchProfile.findMany({
      include: {
        performanceSnapshots: {
          orderBy: { lastEvaluatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
    }),
    prisma.agentRun.findFirst({
      where: {
        agentType: "SEARCH_PROFILE_MANAGER",
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: {
        agentType: "SEARCH_EXPANSION",
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const nextAction = profileNextAction({
    profileCount: profiles.length,
    enabledCount: profiles.filter((profile) => profile.enabled).length,
    optimizerRunAt: latestOptimizerRun?.createdAt ?? null,
    expansionRunAt: latestExpansionRun?.createdAt ?? null,
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Search strategy"
          title="Search Profiles"
          description="Manage reusable search strategies, target titles, filters, salary floors, and profile-health recommendations used by discovery and scoring agents."
          actions={<ProfileCreateForm />}
        />

        <Card sx={{ borderColor: "primary.main", bgcolor: "rgba(37, 99, 235, 0.08)" }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color="primary" label="Next action" />
                  {typeof nextAction.count === "number" ? <Chip size="small" variant="outlined" label={nextAction.count} /> : null}
                </Stack>
                <Typography variant="h3">{nextAction.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{nextAction.detail}</Typography>
              </Box>
              <ActionButton href={nextAction.href} postTo={nextAction.postTo} variant="contained" startIcon={nextAction.icon}>
                {nextAction.label}
              </ActionButton>
            </Stack>
          </CardContent>
        </Card>

        <ProfileSuggestionPanel />
        <ProfileRebuildPanel />
        <ProfileOptimizerPanel latest={isRecord(latestOptimizerRun?.outputJson) ? latestOptimizerRun.outputJson as OptimizerOutput : null} />
        <SearchExpansionPanel latest={isRecord(latestExpansionRun?.outputJson) ? latestExpansionRun.outputJson as SearchExpansionPanelOutput : null} />

        <TableContainer component={Card}>
          <Table sx={{ minWidth: 920 }}>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Remote</TableCell>
                <TableCell>Countries</TableCell>
                <TableCell>Salary</TableCell>
                <TableCell align="right">Health</TableCell>
                <TableCell align="right">Callback</TableCell>
                <TableCell align="right">Threshold</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {profiles.map((profile) => {
                const performance = profile.performanceSnapshots[0];
                return (
                  <TableRow key={profile.id} hover>
                    <TableCell>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Typography sx={{ fontWeight: 800 }}>{profile.name}</Typography>
                        {!profile.enabled ? <Chip size="small" label="Disabled" /> : null}
                      </Stack>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
                        {jsonArray(profile.titles).slice(0, 3).map((title) => (
                          <Chip key={`${profile.id}-${title}`} size="small" variant="outlined" label={title} />
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell><Chip size="small" color="primary" variant="outlined" label={formatStatus(profile.remotePreference)} /></TableCell>
                    <TableCell>{jsonArray(profile.countries).join(", ") || "Any"}</TableCell>
                    <TableCell>{profile.salaryMin ? `${profile.salaryCurrency} ${profile.salaryMin.toLocaleString()}` : "Unknown OK"}</TableCell>
                    <TableCell align="right">
                      {performance ? <ScoreChip score={performance.healthScore} /> : <Typography variant="caption" color="text.secondary">Run optimizer</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      {performance ? (
                        <Stack spacing={0.25} sx={{ alignItems: "flex-end" }}>
                          <Typography sx={{ fontWeight: 850, fontVariantNumeric: "tabular-nums" }}>{performance.callbackRate}%</Typography>
                          <Typography variant="caption" color="text.secondary">{performance.applicationsSubmitted} applied</Typography>
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.secondary">n/a</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <ScoreChip score={profile.minimumMatchScore} />
                    </TableCell>
                    <TableCell align="right">
                      <ProfileActions
                        profile={{
                          id: profile.id,
                          name: profile.name,
                          enabled: profile.enabled,
                          remotePreference: profile.remotePreference,
                          salaryCurrency: profile.salaryCurrency,
                          salaryMin: profile.salaryMin,
                          minimumMatchScore: profile.minimumMatchScore,
                          maxResultsPerRun: profile.maxResultsPerRun,
                          titles: jsonArray(profile.titles),
                          countries: jsonArray(profile.countries),
                          keywordsPreferred: jsonArray(profile.keywordsPreferred),
                          keywordsExcluded: jsonArray(profile.keywordsExcluded),
                          excludedCompanies: jsonArray(profile.excludedCompanies),
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </AppShell>
  );
}

function profileNextAction({
  profileCount,
  enabledCount,
  optimizerRunAt,
  expansionRunAt,
}: {
  profileCount: number;
  enabledCount: number;
  optimizerRunAt: Date | null;
  expansionRunAt: Date | null;
}) {
  if (profileCount === 0) {
    return {
      title: "Create your first search profile",
      detail: "Define target titles, location, remote preference, and scoring threshold before running discovery.",
      label: "Use create profile",
      href: "/profiles",
      icon: <RocketLaunchOutlinedIcon />,
    };
  }
  if (enabledCount === 0) {
    return {
      title: "Enable a search profile",
      detail: "All profiles are disabled. Enable at least one campaign before running discovery.",
      label: "Review profiles",
      href: "/profiles",
      icon: <RocketLaunchOutlinedIcon />,
      count: profileCount,
    };
  }
  if (isOlderThanDays(optimizerRunAt, 7)) {
    return {
      title: "Analyze profile health",
      detail: "Run the optimizer to find overlap, noisy profiles, and weak targeting before spending time on new jobs.",
      label: "Analyze profiles",
      postTo: "/api/profiles/optimize",
      icon: <AutoFixHighOutlinedIcon />,
      count: enabledCount,
    };
  }
  if (isOlderThanDays(expansionRunAt, 14)) {
    return {
      title: "Find search gaps",
      detail: "Compare active profiles against the curated company source list and identify missing focused campaigns.",
      label: "Find gaps",
      postTo: "/api/profiles/expand",
      icon: <ExploreOutlinedIcon />,
      count: enabledCount,
    };
  }
  return {
    title: "Run job discovery",
    detail: "Profiles are configured and recently analyzed. Move to discovery to fetch and score current roles.",
    label: "Open runs",
    href: "/runs",
    icon: <RocketLaunchOutlinedIcon />,
    count: enabledCount,
  };
}

function isOlderThanDays(date: Date | null, days: number) {
  if (!date) return true;
  return Date.now() - date.getTime() > days * 86_400_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
