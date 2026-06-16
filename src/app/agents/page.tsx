export const metadata = {
  title: "Agents | Job Search OS",
  description: "Review agent runs, quality warnings, and workflow recovery controls.",
};

import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import BuildCircleOutlinedIcon from "@mui/icons-material/BuildCircleOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
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
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ScoreChip } from "@/components/ui/score-chip";
import { StatusChip } from "@/components/ui/status-chip";
import { graphRunControlState } from "@/lib/agents/graph-run-controls";
import { buildAgentQualityGates, type AgentQualityGate, type AgentQualityGateSummary } from "@/lib/agents/quality-gates";
import { buildAgentRoster, type AgentRosterItem } from "@/lib/agents/roster";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AgentOutput = {
  actions?: Array<{
    priority?: number;
    title?: string;
    detail?: string;
  }>;
  confidence?: number;
  reasoningSummary?: string;
  rationale?: string;
  warnings?: string[];
  recommendedChanges?: Array<{ action?: string; summary?: string; profileName?: string }>;
  profileHealthScores?: Array<{ name?: string; healthScore?: number; rationale?: string }>;
  recommendedAction?: string;
  fitScore?: number;
  opportunityScore?: number;
  confidenceScore?: number;
  recommendedResumeProfile?: string | null;
  strengths?: string[];
  risks?: string[];
  summary?: string;
  applicationQa?: {
    status?: string;
    score?: number;
    warnings?: string[];
    unsupportedClaims?: string[];
    styleViolations?: string[];
  };
  resumeStrategy?: {
    recommendedResumeProfile?: string;
    positioningSummary?: string;
  };
};

type AgentRunObservability = {
  runtime?: "service" | "langgraph" | "adk";
  adk?: {
    agentId?: string;
    model?: string;
    risk?: string;
    tools?: string[];
  };
};

export default async function AgentReviewBoardPage() {
  const [runs, evidenceNeedsReview, jobEvaluations, profileOptimizerRun, dailyPlanRun, resumesNeedingReview, coverLettersNeedingReview, roster, qualityGates] = await Promise.all([
    prisma.agentRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        user: { select: { email: true, name: true } },
        events: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.candidateEvidence.findMany({
      where: { confidence: "NEEDS_REVIEW" },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.jobEvaluation.findMany({
      where: { recommendedAction: { in: ["APPLY_NOW", "MAYBE_APPLY", "NEEDS_REVIEW"] } },
      include: {
        jobPosting: true,
        jobSearchProfile: { select: { name: true } },
      },
      orderBy: [{ recommendedAction: "asc" }, { fitScore: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.agentRun.findFirst({
      where: { agentType: "SEARCH_PROFILE_MANAGER", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: { agentType: "DAILY_COMMAND_CENTER", status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.generatedResume.findMany({
      include: { applications: { select: { id: true }, take: 1 }, jobPosting: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.generatedCoverLetter.findMany({
      include: { applications: { select: { id: true }, take: 1 }, jobPosting: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    buildAgentRoster(),
    loadAgentQualityGates(),
  ]);
  const latestProfileOutput = outputObject(profileOptimizerRun?.outputJson);
  const latestDailyPlan = outputObject(dailyPlanRun?.outputJson);
  const materialReviewItems = [
    ...resumesNeedingReview.map((resume) => ({
      id: resume.id,
      applicationId: resume.applications[0]?.id ?? null,
      type: "Resume",
      jobId: resume.jobPostingId,
      title: resume.jobPosting.title,
      company: resume.jobPosting.company,
      notes: outputObject(resume.generationNotes) ?? {},
      createdAt: resume.createdAt,
    })),
    ...coverLettersNeedingReview.map((coverLetter) => ({
      id: coverLetter.id,
      applicationId: coverLetter.applications[0]?.id ?? null,
      type: "Cover letter",
      jobId: coverLetter.jobPostingId,
      title: coverLetter.jobPosting.title,
      company: coverLetter.jobPosting.company,
      notes: outputObject(coverLetter.generationNotes) ?? {},
      createdAt: coverLetter.createdAt,
    })),
  ]
    .filter((item) => item.notes.applicationQa?.status === "NEEDS_REVIEW")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 8);
  const nextAction = agentsNextAction({
    evidenceNeedsReviewCount: evidenceNeedsReview.length,
    materialReviewCount: materialReviewItems.length,
    jobRecommendationCount: jobEvaluations.length,
    hasProfileOptimizerRun: Boolean(latestProfileOutput),
    hasDailyPlan: Boolean(latestDailyPlan),
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Agent review"
          title="Agent Review Board"
          description="Review the system's recommendations, warnings, evidence gaps, and generated-material QA before making application decisions."
        />

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
              <ActionButton href={nextAction.href} variant="contained" color={nextAction.color} startIcon={nextAction.icon}>
                {nextAction.label}
              </ActionButton>
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
          <Metric icon={<InsightsOutlinedIcon />} label="Agent runs" value={runs.length.toString()} helper="Recent decisions logged" />
          <Metric icon={<FactCheckOutlinedIcon />} label="Evidence review" value={evidenceNeedsReview.length.toString()} helper="Needs approval or rejection" />
          <Metric icon={<AutoFixHighOutlinedIcon />} label="Job advice" value={jobEvaluations.length.toString()} helper="High-priority evaluations" />
          <Metric icon={<ReportProblemOutlinedIcon />} label="Material QA" value={materialReviewItems.length.toString()} helper="Needs review" />
        </Box>

        {qualityGates ? <AgentQualityGateSection summary={qualityGates} /> : null}

        <AgentControlPlaneSection roster={roster} />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.25fr 1fr" }, gap: 2 }}>
          <Stack spacing={2}>
            <SectionTitle title="Daily Command Center" action={<ActionButton href="/dashboard" size="small" endIcon={<OpenInNewIcon />}>Open dashboard</ActionButton>} />
            <Card>
              <CardContent>
                {latestDailyPlan ? (
                  <Stack spacing={1.5}>
                    <Typography color="text.secondary">{latestDailyPlan.summary ?? latestDailyPlan.rationale ?? "Latest daily plan is available."}</Typography>
                    {(latestDailyPlan.actions ?? []).slice(0, 4).map((action) => (
                      <Box key={`${action.title}-${action.detail ?? "action"}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                          <Typography variant="body2" sx={{ fontWeight: 850 }}>{action.title}</Typography>
                          <Chip size="small" variant="outlined" label={`P${action.priority}`} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">{action.detail}</Typography>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <EmptyState title="No daily plan yet" body="Generate a daily plan from the dashboard." />
                )}
              </CardContent>
            </Card>

            <SectionTitle title="Job Recommendations" action={<ActionButton href="/jobs" size="small" endIcon={<OpenInNewIcon />}>Review jobs</ActionButton>} />
            <Card>
              {jobEvaluations.length === 0 ? (
                <EmptyState title="No job recommendations yet" body="Score the job queue to populate fit, opportunity, and confidence recommendations." />
              ) : (
                <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
                  {jobEvaluations.map((evaluation) => (
                    <CardContent key={evaluation.id}>
                      <Stack spacing={1.5}>
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between" }}>
                          <Box>
                            <Typography variant="h3">{evaluation.jobPosting.title}</Typography>
                            <Typography color="text.secondary">{evaluation.jobPosting.company} · {evaluation.jobSearchProfile.name}</Typography>
                          </Box>
                          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                            <ScoreChip score={evaluation.fitScore} label={`${evaluation.fitScore} fit`} />
                            <ScoreChip score={evaluation.opportunityScore} label={`${evaluation.opportunityScore} opp`} />
                            <ScoreChip score={evaluation.confidenceScore} label={`${evaluation.confidenceScore} conf`} />
                          </Stack>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">{evaluation.explanation}</Typography>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                          <Chip size="small" color={evaluation.recommendedAction === "APPLY_NOW" ? "success" : "warning"} variant="outlined" label={formatAction(evaluation.recommendedAction)} />
                          {evaluation.recommendedResumeProfile ? <Chip size="small" variant="outlined" label={evaluation.recommendedResumeProfile} /> : null}
                          {jsonArray(evaluation.strengths).slice(0, 4).map((signal) => <Chip key={`${evaluation.id}-${signal}`} size="small" variant="outlined" label={signal} />)}
                        </Stack>
                        <ActionButton href={`/jobs/${evaluation.jobPostingId}`} size="small" endIcon={<OpenInNewIcon />}>Open job</ActionButton>
                      </Stack>
                    </CardContent>
                  ))}
                </Stack>
              )}
            </Card>

            <SectionTitle title="Generated Material QA" action={<ActionButton href="/resumes/generated" size="small" endIcon={<OpenInNewIcon />}>Review materials</ActionButton>} />
            <Card>
              {materialReviewItems.length === 0 ? (
                <EmptyState title="No material QA warnings" body="Newly generated resumes and cover letters with QA issues will appear here." />
              ) : (
                <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
                  {materialReviewItems.map((item) => {
                    const qa = item.notes.applicationQa;
                    const issues = [...(qa?.warnings ?? []), ...(qa?.unsupportedClaims ?? []), ...(qa?.styleViolations ?? [])];
                    return (
                      <CardContent key={`${item.type}-${item.id}`}>
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                            <Chip size="small" color="warning" variant="outlined" label={item.type} />
                            {typeof qa?.score === "number" ? <ScoreChip score={qa.score} /> : null}
                            <Typography sx={{ fontWeight: 850 }}>{item.company}</Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary">{item.title}</Typography>
                          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                            {issues.slice(0, 4).map((issue) => <Chip key={`${item.id}-${issue}`} size="small" color="warning" variant="outlined" label={issue} />)}
                          </Stack>
                          <ActionButton href={item.applicationId ? `/applications/${item.applicationId}` : `/jobs/${item.jobId}`} size="small" endIcon={<OpenInNewIcon />}>
                            {item.applicationId ? "Review packet" : "Open job"}
                          </ActionButton>
                        </Stack>
                      </CardContent>
                    );
                  })}
                </Stack>
              )}
            </Card>
          </Stack>

          <Stack spacing={2}>
            <SectionTitle title="Evidence Needs Review" action={<ActionButton href="/evidence?confidence=NEEDS_REVIEW" size="small" endIcon={<OpenInNewIcon />}>Open evidence</ActionButton>} />
            <Card>
              {evidenceNeedsReview.length === 0 ? (
                <EmptyState title="No evidence waiting" body="Candidate evidence marked needs review will appear here." />
              ) : (
                <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
                  {evidenceNeedsReview.map((evidence) => (
                    <CardContent key={evidence.id}>
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <StatusChip status={evidence.confidence} />
                          <Chip size="small" variant="outlined" label={evidence.type} />
                        </Stack>
                        <Typography sx={{ fontWeight: 850 }}>{evidence.title}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden" }}>
                          {evidence.content}
                        </Typography>
                      </Stack>
                    </CardContent>
                  ))}
                </Stack>
              )}
            </Card>

            <SectionTitle title="Profile Optimizer" action={<ActionButton href="/profiles" size="small" endIcon={<OpenInNewIcon />}>Open profiles</ActionButton>} />
            <Card>
              <CardContent>
                <Stack spacing={1.5}>
                  {latestProfileOutput ? (
                    <>
                      <Typography variant="body2" color="text.secondary">{latestProfileOutput.rationale ?? "Latest optimizer run is available."}</Typography>
                      {(latestProfileOutput.recommendedChanges ?? []).slice(0, 5).map((change) => (
                        <Box key={`${change.profileName ?? "profile"}-${change.action ?? "review"}-${change.summary ?? ""}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                          <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                            <Typography variant="body2" sx={{ fontWeight: 850 }}>{change.profileName ?? "Profile"}</Typography>
                            <Chip size="small" variant="outlined" label={change.action ?? "review"} />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">{change.summary}</Typography>
                        </Box>
                      ))}
                    </>
                  ) : (
                    <EmptyState title="No optimizer run yet" body="Run the Search Profile Optimizer from the Profiles page." />
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Box>

        <SectionTitle title="Recent Agent Runs" />
        <TableContainer component={Card}>
          <Table sx={{ minWidth: 960 }}>
            <TableHead>
              <TableRow>
                <TableCell>Agent</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Workflow</TableCell>
                <TableCell>Confidence</TableCell>
                <TableCell>Summary</TableCell>
                <TableCell>Controls</TableCell>
                <TableCell>Created</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState title="No agent runs yet" body="Evidence, scoring, strategy, and QA agents will log runs here." />
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((run) => {
                  const output = outputObject(run.outputJson);
                  const observability = observabilityObject(run.observabilityJson);
                  const controls = graphRunControlState(run);
                  return (
                    <TableRow key={run.id} hover>
                      <TableCell>
                        <Typography sx={{ fontWeight: 850 }}>{formatAction(run.agentType)}</Typography>
                        <Typography variant="caption" color="text.secondary">{run.user?.email ?? "System"}</Typography>
                        {run.parentRunId ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Child of {run.parentRunId.slice(0, 10)}</Typography> : null}
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5}>
                          <StatusChip status={run.status} />
                          {controls.stale ? <Chip size="small" color="warning" variant="outlined" label="stale" /> : null}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 220 }}>
                        {controls.supported ? (
                          <Stack spacing={0.5}>
                            <Chip size="small" color="info" variant="outlined" label="LangGraph" />
                            <Chip size="small" color="info" variant="outlined" label={workflowNodeLabel(run.currentNode)} />
                            <Typography variant="caption" color="text.secondary">{run.workflowVersion}</Typography>
                            <Typography variant="caption" color="text.secondary">{run.graphThreadId}</Typography>
                          </Stack>
                        ) : observability?.runtime === "adk" ? (
                          <Stack spacing={0.5}>
                            <Chip size="small" color="secondary" variant="outlined" label="ADK control plane" />
                            <Typography variant="caption" color="text.secondary">{observability.adk?.agentId}</Typography>
                            <Typography variant="caption" color="text.secondary">{observability.adk?.model}</Typography>
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.secondary">Standard agent run</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {typeof output?.confidence === "number" ? <ScoreChip score={Math.round(output.confidence * 100)} /> : <Chip size="small" label="n/a" />}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 520 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}>
                          {agentSummary(output) || run.error || "No summary saved."}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                          {controls.canRepair ? (
                            <ActionButton postTo={`/api/agents/runs/${run.id}/control`} body={{ action: "repair" }} size="small" color="warning" variant="outlined" startIcon={<BuildCircleOutlinedIcon />} loadingLabel="Repairing...">
                              Repair
                            </ActionButton>
                          ) : null}
                          {controls.canRetry ? (
                            <ActionButton postTo={`/api/agents/runs/${run.id}/control`} body={{ action: "retry" }} size="small" color="primary" variant="outlined" startIcon={<ReplayOutlinedIcon />} loadingLabel="Retrying...">
                              Retry
                            </ActionButton>
                          ) : null}
                          {controls.canCancel ? (
                            <ActionButton postTo={`/api/agents/runs/${run.id}/control`} body={{ action: "cancel" }} size="small" color="error" variant="outlined" startIcon={<StopCircleOutlinedIcon />} loadingLabel="Cancelling...">
                              Cancel
                            </ActionButton>
                          ) : null}
                          {!controls.supported || (!controls.canRepair && !controls.canRetry && !controls.canCancel) ? <Typography variant="caption" color="text.secondary">No action</Typography> : null}
                        </Stack>
                      </TableCell>
                      <TableCell>{run.createdAt.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </AppShell>
  );
}

async function loadAgentQualityGates() {
  const agentUser = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  return agentUser ? buildAgentQualityGates({ userId: agentUser.id }) : null;
}

const runnableEvaluationTargets = new Set(["APPLICATION_ASSISTANT", "RECRUITING_AGENCY", "JOB_SEARCH", "JOB_MATCHING", "GENERATED_MATERIALS"]);

function AgentQualityGateSection({ summary }: { summary: AgentQualityGateSummary }) {
  return (
    <Stack spacing={1.5}>
      <SectionTitle title="Quality Gates" />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(5, 1fr)" }, gap: 1 }}>
        <GateMetric label="Can scale" value={summary.canScale} color="success" />
        <GateMetric label="Blocked" value={summary.blocked} color={summary.blocked ? "error" : "default" } />
        <GateMetric label="Needs review" value={summary.needsReview} color={summary.needsReview ? "warning" : "default"} />
        <GateMetric label="Stale" value={summary.stale} color={summary.stale ? "warning" : "default"} />
        <GateMetric label="Missing eval" value={summary.missingEval} color={summary.missingEval ? "info" : "default"} />
      </Box>
      <TableContainer component={Card}>
        <Table sx={{ minWidth: 1160 }}>
          <TableHead>
            <TableRow>
              <TableCell>Target</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Score</TableCell>
              <TableCell>Coverage</TableCell>
              <TableCell>Signals</TableCell>
              <TableCell>Covered Agents</TableCell>
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {summary.gates.map((gate) => (
              <TableRow key={gate.target} hover>
                <TableCell sx={{ maxWidth: 240 }}>
                  <Typography sx={{ fontWeight: 850 }}>{gate.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{gate.ownerArea}</Typography>
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Chip size="small" color={qualityGateColor(gate.status)} variant="outlined" label={formatAction(gate.status)} />
                    <Typography variant="caption" color="text.secondary">{gate.canScale ? "Scale allowed" : "Review first"}</Typography>
                  </Stack>
                </TableCell>
                <TableCell>{typeof gate.score === "number" ? <ScoreChip score={gate.score} /> : <Chip size="small" label="n/a" />}</TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Typography variant="body2">{gate.examples} example(s)</Typography>
                    <Typography variant="caption" color="text.secondary">{gate.evaluations} evaluation(s)</Typography>
                    {gate.latestEvaluationAt ? <Typography variant="caption" color="text.secondary">Last {new Date(gate.latestEvaluationAt).toLocaleDateString()}</Typography> : null}
                  </Stack>
                </TableCell>
                <TableCell sx={{ maxWidth: 300 }}>
                  <Stack spacing={0.75}>
                    <Typography variant="body2" color="text.secondary">{gate.detail}</Typography>
                    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {gate.failedEvaluations ? <Chip size="small" color="error" variant="outlined" label={`${gate.failedEvaluations} failed`} /> : null}
                      {gate.needsReviewEvaluations ? <Chip size="small" color="warning" variant="outlined" label={`${gate.needsReviewEvaluations} needs review`} /> : null}
                      {gate.proposedImprovements ? <Chip size="small" color="warning" variant="outlined" label={`${gate.proposedImprovements} proposals`} /> : null}
                      {gate.blockedActions ? <Chip size="small" color="error" variant="outlined" label={`${gate.blockedActions} blocked`} /> : null}
                    </Stack>
                  </Stack>
                </TableCell>
                <TableCell sx={{ maxWidth: 260 }}>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {gate.coveredAgentTypes.slice(0, 5).map((agentType) => <Chip key={`${gate.target}-${agentType}`} size="small" variant="outlined" label={formatAction(agentType)} />)}
                    {gate.coveredAgentTypes.length > 5 ? <Chip size="small" label={`+${gate.coveredAgentTypes.length - 5}`} /> : null}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {runnableEvaluationTargets.has(gate.target) ? (
                      <ActionButton postTo="/api/observability/evaluations/run" body={{ target: gate.target }} size="small" variant="contained" loadingLabel="Evaluating...">
                        Run eval
                      </ActionButton>
                    ) : null}
                    <ActionButton href={gate.nextActionHref} size="small" variant="outlined" endIcon={<OpenInNewIcon />}>
                      {gate.nextActionLabel}
                    </ActionButton>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

function GateMetric({ label, value, color }: { label: string; value: number; color: "success" | "error" | "warning" | "info" | "default" }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="h2" sx={{ fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
          </Box>
          <Chip size="small" color={color} variant="outlined" label={label} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function workflowNodeLabel(value: string | null) {
  if (!value) return "graph";
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
}

function agentsNextAction({
  evidenceNeedsReviewCount,
  materialReviewCount,
  jobRecommendationCount,
  hasProfileOptimizerRun,
  hasDailyPlan,
}: {
  evidenceNeedsReviewCount: number;
  materialReviewCount: number;
  jobRecommendationCount: number;
  hasProfileOptimizerRun: boolean;
  hasDailyPlan: boolean;
}) {
  if (evidenceNeedsReviewCount > 0) {
    return {
      title: "Review uncertain evidence",
      detail: "Generation quality depends on approved evidence. Clear uncertain evidence before trusting new materials.",
      label: "Open evidence",
      href: "/evidence?confidence=NEEDS_REVIEW",
      color: "warning" as const,
      icon: <FactCheckOutlinedIcon />,
      count: evidenceNeedsReviewCount,
    };
  }
  if (materialReviewCount > 0) {
    return {
      title: "Review material QA warnings",
      detail: "Generated materials have QA warnings that should be resolved before applications move forward.",
      label: "Review materials",
      href: "/resumes/generated",
      color: "warning" as const,
      icon: <ReportProblemOutlinedIcon />,
      count: materialReviewCount,
    };
  }
  if (jobRecommendationCount > 0) {
    return {
      title: "Act on job recommendations",
      detail: "High-priority job evaluations are ready for approval, rejection, or deeper review.",
      label: "Open jobs",
      href: "/jobs",
      color: "primary" as const,
      icon: <InsightsOutlinedIcon />,
      count: jobRecommendationCount,
    };
  }
  if (!hasProfileOptimizerRun) {
    return {
      title: "Run profile optimizer",
      detail: "No search profile optimization is recorded yet. Analyze campaigns before scaling discovery.",
      label: "Open profiles",
      href: "/profiles",
      color: "primary" as const,
      icon: <AutoFixHighOutlinedIcon />,
    };
  }
  return {
    title: hasDailyPlan ? "Work the daily plan" : "Generate the daily plan",
    detail: hasDailyPlan ? "The command center has a plan. Start there for prioritized actions." : "Generate a short prioritized plan from jobs, evidence, applications, outcomes, and profile health.",
    label: "Open dashboard",
    href: "/dashboard",
    color: "primary" as const,
    icon: <InsightsOutlinedIcon />,
  };
}

function Metric({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper: string }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: "primary.light", color: "primary.dark", display: "grid", placeItems: "center" }}>
            {icon}
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <Typography variant="h2" sx={{ fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
            <Typography variant="caption" color="text.secondary">{helper}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AgentControlPlaneSection({ roster }: { roster: AgentRosterItem[] }) {
  const activeCount = roster.filter((item) => item.currentStatus === "RUNNING" || item.currentStatus === "PENDING").length;
  const blockedCount = roster.reduce((sum, item) => sum + item.blockedActions, 0);
  return (
    <Stack spacing={1.5}>
      <SectionTitle title="Control Plane" />
      <TableContainer component={Card}>
        <Table sx={{ minWidth: 1240 }}>
          <TableHead>
            <TableRow>
              <TableCell>Agent</TableCell>
              <TableCell>Owner</TableCell>
              <TableCell>Runtime</TableCell>
              <TableCell>Policy</TableCell>
              <TableCell>Tools</TableCell>
              <TableCell>Side Effects</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Child Runs</TableCell>
              <TableCell>Blocked</TableCell>
              <TableCell>Eval</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell colSpan={10} sx={{ bgcolor: "action.hover" }}>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Chip size="small" color={activeCount ? "warning" : "success"} label={`${activeCount} active`} />
                  <Chip size="small" color={blockedCount ? "warning" : "default"} variant="outlined" label={`${blockedCount} blocked actions`} />
                  <Chip size="small" variant="outlined" label={`${roster.length} registered agents`} />
                </Stack>
              </TableCell>
            </TableRow>
            {roster.map((item) => (
              <TableRow key={item.agentType} hover>
                <TableCell sx={{ maxWidth: 220 }}>
                  <Typography sx={{ fontWeight: 850 }}>{item.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.agentType}</Typography>
                </TableCell>
                <TableCell>{item.ownerArea}</TableCell>
                <TableCell>
                  <Chip size="small" variant="outlined" color={runtimeColor(item.runtime)} label={formatAction(item.runtime)} />
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Chip size="small" color={item.approvalRequired ? "warning" : "success"} variant="outlined" label={formatAction(item.actionPolicyKind)} />
                    <Typography variant="caption" color="text.secondary">{item.approvalRequired ? "Approval required" : "No approval gate"}</Typography>
                    {item.forbiddenActions.slice(0, 2).map((action) => (
                      <Typography key={`${item.agentType}-${action}`} variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Blocks {formatAction(action)}
                      </Typography>
                    ))}
                  </Stack>
                </TableCell>
                <TableCell sx={{ maxWidth: 260 }}>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {item.allowedTools.slice(0, 4).map((tool) => <Chip key={`${item.agentType}-${tool}`} size="small" variant="outlined" label={tool} />)}
                    {item.allowedTools.length > 4 ? <Chip size="small" label={`+${item.allowedTools.length - 4}`} /> : null}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {item.sideEffects.map((effect) => <Chip key={`${item.agentType}-${effect}`} size="small" variant="outlined" label={formatAction(effect)} />)}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack spacing={0.5}>
                    <StatusChip status={item.currentStatus} />
                    {item.lastRunAt ? <Typography variant="caption" color="text.secondary">{item.lastRunAt.toLocaleString()}</Typography> : null}
                  </Stack>
                </TableCell>
                <TableCell>{item.childRuns}</TableCell>
                <TableCell>
                  <Chip size="small" color={item.blockedActions ? "warning" : "default"} variant="outlined" label={item.blockedActions} />
                </TableCell>
                <TableCell>
                  {typeof item.lastEvalScore === "number" ? (
                    <Stack spacing={0.5}>
                      <ScoreChip score={item.lastEvalScore} />
                      {item.lastEvalStatus ? <Typography variant="caption" color="text.secondary">{formatAction(item.lastEvalStatus)}</Typography> : null}
                    </Stack>
                  ) : (
                    <Chip size="small" label="n/a" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
      <Typography variant="h3">{title}</Typography>
      {action}
    </Stack>
  );
}

function outputObject(value: unknown): AgentOutput | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AgentOutput : null;
}

function observabilityObject(value: unknown): AgentRunObservability | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AgentRunObservability : null;
}

function agentSummary(output: AgentOutput | null) {
  if (!output) return "";
  return output.reasoningSummary ?? output.rationale ?? output.applicationQa?.warnings?.[0] ?? output.resumeStrategy?.positioningSummary ?? "";
}

function formatAction(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function runtimeColor(runtime: AgentRosterItem["runtime"]) {
  if (runtime === "langgraph") return "info";
  if (runtime === "adk") return "secondary";
  return "default";
}

function qualityGateColor(status: AgentQualityGate["status"]) {
  if (status === "pass") return "success";
  if (status === "blocked") return "error";
  if (status === "needs_review" || status === "stale") return "warning";
  return "info";
}
