export const metadata = {
  title: "Job Detail | Job Search OS",
  description: "Review a scored job, matching evidence, materials, and application state.",
};

import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import ContactPageOutlinedIcon from "@mui/icons-material/ContactPageOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound, redirect } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { JobDescription } from "@/components/job-description";
import { JobRejectButton } from "@/components/job-reject-button";
import { PageHeader } from "@/components/ui/page-header";
import { ScoreChip } from "@/components/ui/score-chip";
import { jsonArray } from "@/lib/json";
import { selectCanonicalApplicationForJob } from "@/lib/applications/apply-workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const job = await prisma.jobPosting.findUnique({
    where: { id: params.id },
    include: {
      matches: {
        include: {
          jobSearchProfile: { select: { name: true, userId: true } },
        },
        orderBy: { overallScore: "desc" },
      },
      evaluations: {
        include: {
          jobSearchProfile: { select: { name: true } },
        },
        orderBy: { fitScore: "desc" },
      },
      source: true,
      coverLetters: { orderBy: { createdAt: "desc" }, take: 1 },
      resumes: { orderBy: { createdAt: "desc" }, take: 1 },
      applications: {
        include: {
          applicationPackets: { orderBy: { updatedAt: "desc" }, take: 1 },
          events: { orderBy: { createdAt: "desc" }, take: 1 },
          outcomes: { orderBy: { occurredAt: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      },
    },
  });

  if (!job) notFound();

  const canonicalApplication = selectCanonicalApplicationForJob(job.applications);
  if (canonicalApplication) {
    redirect(`/applications/${canonicalApplication.id}`);
  }

  const topMatch = job.matches[0];
  const topEvaluation = job.evaluations[0];

  return (
    <>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Job detail"
          title={job.title}
          description={`${job.company} · ${job.location ?? "Unknown location"} · ${job.remoteType}`}
        />

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                {topMatch ? <ScoreChip score={topMatch.overallScore} label={`${topMatch.overallScore} match`} /> : null}
                {topEvaluation ? <ScoreChip score={topEvaluation.opportunityScore} label={`${topEvaluation.opportunityScore} opportunity`} /> : null}
                {topEvaluation ? <ScoreChip score={topEvaluation.confidenceScore} label={`${topEvaluation.confidenceScore} confidence`} /> : null}
                {topMatch ? <Chip variant="outlined" label={topMatch.jobSearchProfile.name} /> : null}
                {topEvaluation ? <Chip variant="outlined" label={formatAction(topEvaluation.recommendedAction)} /> : null}
                {topEvaluation?.recommendedResumeProfile ? <Chip variant="outlined" label={topEvaluation.recommendedResumeProfile} /> : null}
                {job.source ? <Chip variant="outlined" label={job.source.name} /> : null}
                {job.duplicateGroupId ? <Chip color="warning" variant="outlined" label="Duplicate group" /> : null}
                {job.staleScore >= 45 ? <Chip color="warning" variant="outlined" label={`Stale ${job.staleScore}`} /> : null}
                {job.applicationUrl ? <Chip variant="outlined" label="Application URL saved" /> : null}
              </Stack>

              {topMatch ? (
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2 }}>
                  <Score label="Title" value={topMatch.titleFit} />
                  <Score label="Skills" value={topMatch.skillFit} />
                  <Score label="Remote" value={topMatch.remoteFit} />
                  <Score label="Comp" value={topMatch.compensationFit} />
                </Box>
              ) : null}

              <Divider />
              {topMatch ? (
                <>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                    <Box>
                      <Typography variant="h3">Review decision</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Approve this job to create or refresh its application tracker, or reject it so this job and its duplicates stop resurfacing.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
                      <JobRejectButton
                        jobId={job.id}
                        matchId={topMatch.id}
                        label={`${job.company} - ${job.title}`}
                        variant="outlined"
                        color="error"
                        source="job_detail_reject"
                      />
                      <ActionButton
                        postTo={`/api/jobs/${job.id}/approve`}
                        body={{ matchId: topMatch.id }}
                        variant="contained"
                        color="success"
                        startIcon={<AssignmentTurnedInOutlinedIcon />}
                      >
                        Approve
                      </ActionButton>
                    </Stack>
                  </Stack>
                  <Divider />
                </>
              ) : null}
              <Alert severity="info">
                This app prepares materials and tracks the application. It does not submit applications automatically.
              </Alert>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                <Box>
                  <Typography variant="h3">Application package</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Use Prepare package for the normal path: it creates the tailored resume and cover letter, then moves this job into the ready queue.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
                  <ActionButton
                    postTo={`/api/jobs/${job.id}/prepare-application`}
                    variant="contained"
                    color="success"
                    startIcon={<AssignmentTurnedInOutlinedIcon />}
                    message="Package generation started. You can leave this page."
                    loadingLabel="Preparing..."
                    runInBackground
                  >
                    Prepare package
                  </ActionButton>
                  <ActionButton
                    postTo={`/api/jobs/${job.id}/generate-resume`}
                    variant="contained"
                    startIcon={<ArticleOutlinedIcon />}
                    message="Resume generation started. You can leave this page."
                    loadingLabel="Generating..."
                    runInBackground
                  >
                    Generate tailored resume
                  </ActionButton>
                  <ActionButton
                    postTo={`/api/jobs/${job.id}/generate-cover-letter`}
                    variant="contained"
                    color="secondary"
                    startIcon={<ContactPageOutlinedIcon />}
                    message="Cover letter generation started. You can leave this page."
                    loadingLabel="Generating..."
                    runInBackground
                  >
                    Generate cover letter
                  </ActionButton>
                  <ActionButton
                    postTo={`/api/jobs/${job.id}/generate-resume`}
                    variant="outlined"
                    startIcon={<RestartAltOutlinedIcon />}
                    message="Resume regeneration started. You can leave this page."
                    loadingLabel="Regenerating..."
                    runInBackground
                  >
                    Regenerate
                  </ActionButton>
                  <ActionButton href="/resumes/generated" variant="outlined" startIcon={<RuleOutlinedIcon />}>Rationale</ActionButton>
                  {job.applicationUrl ? <ActionButton href={job.applicationUrl} variant="outlined" startIcon={<OpenInNewIcon />}>Open application</ActionButton> : null}
                  <ActionButton href="/resumes/generated" variant="outlined" startIcon={<EditOutlinedIcon />}>Edit</ActionButton>
                </Stack>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {topMatch ? (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h3">Match explanation</Typography>
                <Typography color="text.secondary">{topEvaluation?.explanation ?? topMatch.aiExplanation}</Typography>
                <SignalSection title="Strongest matches" items={jsonArray(topEvaluation?.strengths ?? topMatch.strongestMatches)} color="success" />
                <SignalSection title="Concerns" items={jsonArray(topEvaluation?.risks ?? topMatch.concerns)} color="warning" />
                <SignalSection title="Missing keywords" items={jsonArray(topEvaluation?.missingKeywords ?? topMatch.missingKeywords)} color="error" />
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        {job.coverLetters[0] ? (
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                  <Box>
                    <Typography variant="h3">Latest cover letter</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Version {job.coverLetters[0].version} generated {job.coverLetters[0].createdAt.toLocaleString()}.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                    <ActionButton href={`/api/cover-letters/${job.coverLetters[0].id}/plain-text`} variant="outlined" startIcon={<ArticleOutlinedIcon />}>Download text</ActionButton>
                    <ActionButton href={`/api/cover-letters/${job.coverLetters[0].id}/pdf`} variant="outlined" startIcon={<DownloadOutlinedIcon />}>Download PDF</ActionButton>
                  </Stack>
                </Stack>
                <Typography component="pre" sx={{ whiteSpace: "pre-wrap", fontFamily: "inherit", m: 0, color: "text.secondary" }}>
                  {job.coverLetters[0].body}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        {job.resumes[0] ? (
          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h3">Latest tailored resume</Typography>
                <Typography variant="body2" color="text.secondary">
                  Version {job.resumes[0].version} generated {job.resumes[0].createdAt.toLocaleString()}.
                </Typography>
                <ActionButton href={`/api/resumes/generated/${job.resumes[0].id}/pdf`} variant="outlined" startIcon={<DownloadOutlinedIcon />}>Download latest ATS PDF</ActionButton>
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h3">Description</Typography>
              <JobDescription description={job.description} />
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "#fafcfd" }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>{label}</Typography>
      <Typography variant="h2" sx={{ fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Box>
  );
}

function SignalSection({ title, items, color }: { title: string; items: string[]; color: "success" | "warning" | "error" }) {
  if (items.length === 0) return null;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase" }}>{title}</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mt: 1 }}>
        {items.map((item) => <Chip key={`${title}-${item}`} size="small" color={color} variant="outlined" label={item} />)}
      </Stack>
    </Box>
  );
}

function formatAction(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
