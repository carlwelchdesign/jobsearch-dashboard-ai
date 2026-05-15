import Card from "@mui/material/Card";
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
import { PageHeader } from "@/components/ui/page-header";
import { ScoreChip } from "@/components/ui/score-chip";
import { formatStatus } from "@/components/ui/status-chip";
import { WorkflowGuide } from "@/components/ui/workflow-guide";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { ProfileCreateForm } from "./profile-create-form";
import { ProfileActions } from "./profile-actions";
import { ProfileSuggestionPanel } from "./profile-suggestion-panel";
import { ProfileOptimizerPanel } from "./profile-optimizer-panel";
import type { OptimizerOutput } from "./profile-optimizer-panel";
import { SearchExpansionPanel } from "./search-expansion-panel";
import type { SearchExpansionPanelOutput } from "./search-expansion-panel";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const profiles = await prisma.jobSearchProfile.findMany({
    include: {
      performanceSnapshots: {
        orderBy: { lastEvaluatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ enabled: "desc" }, { name: "asc" }],
  });
  const latestOptimizerRun = await prisma.agentRun.findFirst({
    where: {
      agentType: "SEARCH_PROFILE_MANAGER",
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
  });
  const latestExpansionRun = await prisma.agentRun.findFirst({
    where: {
      agentType: "SEARCH_EXPANSION",
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Campaigns"
          title="Search Profiles"
          description="Step 1: define what a good job looks like. Profiles control titles, location, remote preference, salary floor, and match threshold before any search run starts."
          actions={<ProfileCreateForm />}
        />

        <WorkflowGuide active="profiles" title="Step 1 of 5: set the search intent" />

        <ProfileSuggestionPanel />
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
                        {jsonArray(profile.titles).slice(0, 3).map((title, index) => (
                          <Chip key={`${profile.id}-${title}-${index}`} size="small" variant="outlined" label={title} />
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
