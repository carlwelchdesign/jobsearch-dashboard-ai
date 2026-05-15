import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ContactPageOutlinedIcon from "@mui/icons-material/ContactPageOutlined";
import ConnectWithoutContactOutlinedIcon from "@mui/icons-material/ConnectWithoutContactOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ScoreChip } from "@/components/ui/score-chip";
import { StatusChip } from "@/components/ui/status-chip";
import { WorkflowGuide } from "@/components/ui/workflow-guide";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { applicationAnswerEntries, packetApprovalChecklist, packetApprovalState } from "@/lib/applications/application-packets";
import { ApprovePacketButton } from "./approve-packet-button";
import { DeletePacketAnswerButton } from "./delete-packet-answer-button";
import { InterviewPrepButton } from "./interview-prep-button";
import { CompanyResearchButton } from "./company-research-button";
import { CompensationOpportunityButton } from "./compensation-opportunity-button";
import { OutcomeForm } from "./outcome-form";
import { PortfolioMatchButton } from "./portfolio-match-button";
import { RecruiterOutreachButton } from "./recruiter-outreach-button";
import { MarkAppliedButton } from "../mark-applied-button";

export const dynamic = "force-dynamic";

type MaterialNotes = {
  applicationQa?: {
    status?: "PASS" | "NEEDS_REVIEW";
    score?: number;
    warnings?: string[];
    unsupportedClaims?: string[];
    styleViolations?: string[];
    suggestedEdits?: string[];
    evidenceRefs?: string[];
  };
  resumeStrategy?: {
    recommendedResumeProfile?: string;
    positioningSummary?: string;
    emphasisTags?: string[];
    priorityProjects?: string[];
    omitSignals?: string[];
    evidenceRefs?: string[];
    rationale?: string;
  } | null;
  warnings?: string[];
  unsupportedClaimsDetected?: string[];
};

type InterviewPrepOutput = {
  applicationId?: string;
  company?: string;
  role?: string;
  positioning?: string;
  likelyThemes?: string[];
  evidenceStories?: Array<{ title: string; evidenceRef: string; talkingPoint: string }>;
  risksToPrepare?: string[];
  questionsToAsk?: string[];
  followUpFocus?: string[];
};

type RecruiterQualityReview = {
  status?: "PASS" | "NEEDS_REVIEW";
  warnings?: string[];
  styleViolations?: string[];
};

type PortfolioMatchOutput = {
  applicationId?: string;
  projectLinks?: Array<{
    name: string;
    url: string | null;
    source: "profile_project" | "github_repo";
    fitScore: number;
    talkingPoint: string;
    tags: string[];
  }>;
  warnings?: string[];
  confidence?: number;
  reasoningSummary?: string;
};

type CompanyResearchOutput = {
  brief?: string;
  roleThemes?: string[];
  likelyTeamNeeds?: string[];
  positioningAngles?: string[];
  questionsToAnswer?: string[];
  risks?: string[];
  sourceNotes?: string[];
  confidence?: number;
  reasoningSummary?: string;
};

type CompensationOpportunityOutput = {
  opportunityScore?: number;
  compensationAssessment?: string;
  remoteAssessment?: string;
  freshnessAssessment?: string;
  strategicValue?: string[];
  negotiationPrep?: string[];
  risks?: string[];
  recommendedAction?: string;
  confidence?: number;
  reasoningSummary?: string;
};

export default async function ApplicationPacketPage({ params }: { params: { id: string } }) {
  const [application, latestPrepRun, latestPortfolioRun, latestCompanyResearchRun, latestCompensationRun] = await Promise.all([
    prisma.application.findUnique({
      where: { id: params.id },
      include: {
        coverLetter: true,
        events: { orderBy: { createdAt: "desc" }, take: 8 },
        applicationPackets: { orderBy: { updatedAt: "desc" }, take: 1 },
        jobPosting: {
          include: {
            evaluations: { orderBy: { fitScore: "desc" }, take: 1 },
            source: true,
          },
        },
        jobProfileMatch: {
          include: { jobSearchProfile: { select: { name: true } } },
        },
        resume: true,
        outcomes: { orderBy: { occurredAt: "desc" }, take: 12 },
        user: { include: { profile: true } },
      },
    }),
    prisma.agentRun.findFirst({
      where: {
        agentType: "INTERVIEW_PREP",
        status: "COMPLETED",
        inputJson: {
          path: ["applicationId"],
          equals: params.id,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: {
        agentType: "PORTFOLIO_MATCH",
        status: "COMPLETED",
        inputJson: {
          path: ["applicationId"],
          equals: params.id,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: {
        agentType: "COMPANY_RESEARCH",
        status: "COMPLETED",
        inputJson: {
          path: ["applicationId"],
          equals: params.id,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agentRun.findFirst({
      where: {
        agentType: "COMPENSATION_OPPORTUNITY",
        status: "COMPLETED",
        inputJson: {
          path: ["applicationId"],
          equals: params.id,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!application) notFound();

  const packet = application.applicationPackets[0];
  const resumeNotes = materialNotes(application.resume?.generationNotes);
  const coverLetterNotes = materialNotes(application.coverLetter?.generationNotes);
  const qa = coverLetterNotes.applicationQa ?? resumeNotes.applicationQa;
  const strategy = resumeNotes.resumeStrategy ?? coverLetterNotes.resumeStrategy;
  const evaluation = application.jobPosting.evaluations[0];
  const evidenceRefs = Array.from(new Set([...(strategy?.evidenceRefs ?? []), ...(qa?.evidenceRefs ?? [])]));
  const interviewPrep = interviewPrepOutput(latestPrepRun?.outputJson);
  const portfolioMatch = portfolioMatchOutput(latestPortfolioRun?.outputJson);
  const companyResearch = companyResearchOutput(latestCompanyResearchRun?.outputJson);
  const compensationOpportunity = compensationOpportunityOutput(latestCompensationRun?.outputJson);
  const approvalState = packet ? packetApprovalState(packet) : null;
  const approvalChecklist = packetApprovalChecklist(packet);
  const savedAnswers = applicationAnswerEntries(packet?.applicationAnswersJson);
  const latestOutreach = await prisma.recruiterOutreach.findFirst({
    where: {
      userId: application.userId,
      jobPostingId: application.jobPostingId,
    },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
  });
  const outreachQuality = recruiterQualityReview(latestOutreach?.qualityReview);
  const qaIssues = [
    ...(qa?.warnings ?? []),
    ...(qa?.unsupportedClaims ?? []),
    ...(qa?.styleViolations ?? []),
  ];

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Application packet"
          title={`${application.jobPosting.company} · ${application.jobPosting.title}`}
          description="Review the generated resume, cover letter, strategy, QA warnings, and evidence references before submitting manually."
          actions={
            <>
              <ActionButton href={`/jobs/${application.jobPostingId}`} variant="outlined" startIcon={<OpenInNewIcon />}>Open job</ActionButton>
              {application.jobPosting.applicationUrl ? (
                <ActionButton href={application.jobPosting.applicationUrl} variant="outlined" startIcon={<OpenInNewIcon />}>Employer form</ActionButton>
              ) : null}
            </>
          }
        />

        <WorkflowGuide active={application.status === "ready_to_apply" ? "sprint" : "applications"} title="Review packet before manual submission" />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(5, 1fr)" }, gap: 2 }}>
          <Metric label="Status" value={<StatusChip status={application.status} />} helper="Application workflow" />
          <Metric label="Match" value={application.jobProfileMatch ? <ScoreChip score={application.jobProfileMatch.overallScore} /> : "n/a"} helper={application.jobProfileMatch?.jobSearchProfile.name ?? "No matched profile"} />
          <Metric label="Opportunity" value={evaluation ? <ScoreChip score={evaluation.opportunityScore} /> : "n/a"} helper={evaluation?.recommendedResumeProfile ?? "Not evaluated"} />
          <Metric label="QA" value={qa ? <ScoreChip score={qa.score ?? 0} label={qa.status === "PASS" ? "Pass" : "Review"} /> : "pending"} helper={qaIssues.length ? `${qaIssues.length} review items` : "No issues saved"} />
          <Metric label="Packet" value={packet ? <StatusChip status={packet.status} /> : "pending"} helper={packet ? `Updated ${packet.updatedAt.toLocaleString()}` : "Prepare package to persist"} />
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                <Box>
                  <Typography variant="h3">Packet controls</Typography>
                  <Typography variant="body2" color="text.secondary">
                    This app prepares materials and assistant data. Submission stays manual.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: { md: "flex-end" } }}>
                  {application.resume ? <ActionButton href={`/api/resumes/generated/${application.resume.id}/pdf`} variant="outlined" startIcon={<DownloadOutlinedIcon />}>Resume PDF</ActionButton> : null}
                  {application.coverLetter ? <ActionButton href={`/api/cover-letters/${application.coverLetter.id}/pdf`} variant="outlined" startIcon={<DownloadOutlinedIcon />}>Letter PDF</ActionButton> : null}
                  <CompanyResearchButton applicationId={application.id} />
                  <CompensationOpportunityButton applicationId={application.id} />
                  <PortfolioMatchButton applicationId={application.id} />
                  <RecruiterOutreachButton applicationId={application.id} />
                  <InterviewPrepButton applicationId={application.id} />
                  {approvalState?.canApprove ? <ApprovePacketButton applicationId={application.id} /> : null}
                  {application.status === "ready_to_apply" && application.resume && application.coverLetter ? (
                    <>
                      <ActionButton
                        postTo={`/api/applications/${application.id}/launch-assistant`}
                        message="Local assistant launched. Review the browser window and submit manually."
                        variant="contained"
                        color="success"
                        startIcon={<PlayCircleOutlineOutlinedIcon />}
                      >
                        Launch assistant
                      </ActionButton>
                      <MarkAppliedButton applicationId={application.id} size="medium" />
                    </>
                  ) : null}
                </Stack>
              </Stack>
              {qaIssues.length ? (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {qaIssues.map((issue) => <Chip key={issue} color="warning" variant="outlined" label={issue} />)}
                </Stack>
              ) : null}
              <Alert severity={approvalState?.canApprove ? "success" : "info"}>
                {approvalState?.canApprove ? "This packet is ready for approval." : approvalState?.reason ?? "Prepare the application package before approval."}
              </Alert>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                {approvalChecklist.map((item) => (
                  <Chip
                    key={item.label}
                    color={item.complete ? "success" : "default"}
                    variant={item.complete ? "filled" : "outlined"}
                    label={`${item.complete ? "Done" : "Needed"}: ${item.label}`}
                    title={item.detail}
                  />
                ))}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
          <MaterialCard
            title="Tailored resume"
            icon={<ArticleOutlinedIcon />}
            body={application.resume?.plainText ?? application.resume?.markdown ?? ""}
            emptyTitle="No resume generated"
            emptyBody="Prepare the package or generate a tailored resume from the job detail page."
            actions={application.resume ? (
              <>
                <ActionButton href={`/api/resumes/generated/${application.resume.id}/plain-text`} size="small">Text</ActionButton>
                <ActionButton href={`/api/resumes/generated/${application.resume.id}/pdf`} size="small">PDF</ActionButton>
              </>
            ) : null}
          />
          <MaterialCard
            title="Cover letter"
            icon={<ContactPageOutlinedIcon />}
            body={application.coverLetter?.body ?? ""}
            emptyTitle="No cover letter generated"
            emptyBody="Prepare the package or generate a cover letter from the job detail page."
            actions={application.coverLetter ? (
              <>
                <ActionButton href={`/api/cover-letters/${application.coverLetter.id}/plain-text`} size="small">Text</ActionButton>
                <ActionButton href={`/api/cover-letters/${application.coverLetter.id}/pdf`} size="small">PDF</ActionButton>
              </>
            ) : null}
          />
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h3">Application answers</Typography>
              {savedAnswers.length ? (
                <Stack spacing={2}>
                  {savedAnswers.map((entry, entryIndex) => (
                    <Box key={entry.id ?? `${entry.question}-${entryIndex}`} sx={{ borderTop: entryIndex ? 1 : 0, borderColor: "divider", pt: entryIndex ? 2 : 0 }}>
                      <Stack spacing={1.5}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}>
                          <Box>
                            <Typography sx={{ fontWeight: 850 }}>{entry.question}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {entry.generatedBy ?? "generated"}{entry.createdAt ? ` · ${new Date(entry.createdAt).toLocaleString()}` : ""}
                            </Typography>
                          </Box>
                          {entry.id ? <DeletePacketAnswerButton applicationId={application.id} answerId={entry.id} /> : null}
                        </Stack>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "repeat(3, 1fr)" }, gap: 1.5 }}>
                          {entry.options.map((option, optionIndex) => (
                            <Box key={`${entry.question}-${option.title}-${optionIndex}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                              <Stack spacing={1}>
                                <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                                  <Typography sx={{ fontWeight: 850 }}>{option.title}</Typography>
                                  <Chip size="small" variant="outlined" label={`Option ${optionIndex + 1}`} />
                                </Stack>
                                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{option.answer}</Typography>
                                <SignalSection title="Evidence" items={option.evidence ?? []} color="primary" />
                                <SignalSection title="Cautions" items={option.cautions ?? []} color="warning" />
                              </Stack>
                            </Box>
                          ))}
                        </Box>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <EmptyState title="No saved answers" body="Use the Apply Sprint question helper to generate answer options. Saved options will appear here for review before submission." />
              )}
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h3">Resume strategy</Typography>
                {strategy ? (
                  <>
                    <Typography color="text.secondary">{strategy.positioningSummary ?? strategy.rationale}</Typography>
                    <SignalSection title="Emphasis" items={strategy.emphasisTags ?? []} color="primary" />
                    <SignalSection title="Priority projects" items={strategy.priorityProjects ?? []} color="success" />
                    <SignalSection title="Omit" items={strategy.omitSignals ?? []} color="warning" />
                  </>
                ) : (
                  <EmptyState title="No strategy saved" body="Newly generated packets will include strategy metadata." />
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h3">Evidence references</Typography>
                {evidenceRefs.length ? (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      These approved evidence IDs were attached internally to strategy or QA output.
                    </Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {evidenceRefs.slice(0, 20).map((ref) => <Chip key={ref} size="small" variant="outlined" label={ref} />)}
                    </Stack>
                  </>
                ) : (
                  <EmptyState title="No evidence refs saved" body="Regenerate the packet after approving evidence to attach stronger traceability." />
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <BusinessOutlinedIcon />
                <Typography variant="h3">Company brief</Typography>
              </Stack>
              {companyResearch ? (
                <Stack spacing={2}>
                  <Typography color="text.secondary">{companyResearch.brief}</Typography>
                  <SignalSection title="Role themes" items={companyResearch.roleThemes ?? []} color="primary" />
                  <PrepList title="Likely team needs" items={companyResearch.likelyTeamNeeds ?? []} />
                  <PrepList title="Positioning angles" items={companyResearch.positioningAngles ?? []} />
                  <PrepList title="Questions to answer" items={companyResearch.questionsToAnswer ?? []} />
                  <SignalSection title="Brief risks" items={companyResearch.risks ?? []} color="warning" />
                  <SignalSection title="Source notes" items={companyResearch.sourceNotes ?? []} color="success" />
                </Stack>
              ) : (
                <EmptyState title="No company brief yet" body="Generate a grounded company/job brief from the saved job description and source metadata." />
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <PaidOutlinedIcon />
                <Typography variant="h3">Compensation opportunity</Typography>
              </Stack>
              {compensationOpportunity ? (
                <Stack spacing={2}>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {typeof compensationOpportunity.opportunityScore === "number" ? <ScoreChip score={compensationOpportunity.opportunityScore} label={`${compensationOpportunity.opportunityScore} opp`} /> : null}
                    {compensationOpportunity.recommendedAction ? <Chip variant="outlined" label={formatAction(compensationOpportunity.recommendedAction)} /> : null}
                    {typeof compensationOpportunity.confidence === "number" ? <Chip variant="outlined" label={`Confidence ${Math.round(compensationOpportunity.confidence * 100)}`} /> : null}
                  </Stack>
                  <PrepList title="Assessments" items={[compensationOpportunity.compensationAssessment, compensationOpportunity.remoteAssessment, compensationOpportunity.freshnessAssessment].filter((item): item is string => Boolean(item))} />
                  <SignalSection title="Strategic value" items={compensationOpportunity.strategicValue ?? []} color="success" />
                  <PrepList title="Negotiation prep" items={compensationOpportunity.negotiationPrep ?? []} />
                  <SignalSection title="Comp risks" items={compensationOpportunity.risks ?? []} color="warning" />
                </Stack>
              ) : (
                <EmptyState title="No compensation brief yet" body="Generate a compensation opportunity brief from saved salary, remote, freshness, and profile preference data." />
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <AccountTreeOutlinedIcon />
                <Typography variant="h3">Portfolio match</Typography>
              </Stack>
              {portfolioMatch?.projectLinks?.length ? (
                <Stack spacing={1.5}>
                  <Typography variant="body2" color="text.secondary">
                    {portfolioMatch.reasoningSummary ?? "Matched projects and GitHub repositories against this job."}
                  </Typography>
                  {portfolioMatch.projectLinks.map((project) => (
                    <Box key={`${project.source}-${project.name}`} sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                        <Box>
                          <Typography sx={{ fontWeight: 850 }}>{project.name}</Typography>
                          <Typography variant="body2" color="text.secondary">{project.talkingPoint}</Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <ScoreChip score={project.fitScore} />
                          {project.url ? <ActionButton href={project.url} size="small" endIcon={<OpenInNewIcon />}>Open</ActionButton> : null}
                        </Stack>
                      </Stack>
                      <SignalSection title={project.source === "github_repo" ? "Repository tags" : "Project tags"} items={project.tags ?? []} color="primary" />
                    </Box>
                  ))}
                </Stack>
              ) : (
                <EmptyState title="No portfolio match yet" body="Generate a portfolio match to choose which projects or GitHub repositories to mention for this role." />
              )}
              <SignalSection title="Portfolio warnings" items={portfolioMatch?.warnings ?? []} color="warning" />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <ConnectWithoutContactOutlinedIcon />
                <Typography variant="h3">Recruiter outreach</Typography>
              </Stack>
              {latestOutreach ? (
                <Stack spacing={2}>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    <StatusChip status={latestOutreach.status} />
                    {latestOutreach.contact ? <Chip variant="outlined" label={latestOutreach.contact.name} /> : <Chip variant="outlined" label="No contact attached" />}
                    <Chip variant="outlined" label={outreachQuality?.status ?? "Review"} />
                  </Stack>
                  <Typography
                    component="pre"
                    sx={{
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      color: "text.secondary",
                      m: 0,
                    }}
                  >
                    {latestOutreach.message}
                  </Typography>
                  <SignalSection title="Evidence refs" items={jsonArray(latestOutreach.evidenceRefs)} color="primary" />
                  <SignalSection title="Review warnings" items={[...(outreachQuality?.warnings ?? []), ...(outreachQuality?.styleViolations ?? [])]} color="warning" />
                </Stack>
              ) : (
                <EmptyState title="No recruiter note drafted" body="Generate a short outreach draft when you want a recruiter or hiring-manager message. Nothing is sent automatically." />
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <PsychologyOutlinedIcon />
                <Typography variant="h3">Interview prep</Typography>
              </Stack>
              {interviewPrep ? (
                <Stack spacing={2}>
                  <Typography color="text.secondary">{interviewPrep.positioning}</Typography>
                  <SignalSection title="Likely themes" items={interviewPrep.likelyThemes ?? []} color="primary" />
                  <SignalSection title="Risks to prepare" items={interviewPrep.risksToPrepare ?? []} color="warning" />
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
                    <PrepList title="Evidence stories" items={(interviewPrep.evidenceStories ?? []).map((story) => `${story.title}: ${story.talkingPoint}`)} />
                    <PrepList title="Questions to ask" items={interviewPrep.questionsToAsk ?? []} />
                  </Box>
                  <PrepList title="Follow-up focus" items={interviewPrep.followUpFocus ?? []} />
                </Stack>
              ) : (
                <EmptyState title="No interview prep yet" body="Generate a prep brief after the packet is ready or once an interview is scheduled." />
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h3">Outcome log</Typography>
              <Typography variant="body2" color="text.secondary">
                Record replies and decisions as they happen. These entries feed Outcome Learning and preserve more detail than the board status alone.
              </Typography>
              <OutcomeForm applicationId={application.id} />
              {application.outcomes.length ? (
                <Stack spacing={1}>
                  {application.outcomes.map((outcome) => (
                    <Box key={outcome.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                        <Chip size="small" variant="outlined" label={formatOutcome(outcome.outcome)} />
                        <Typography variant="caption" color="text.secondary">{outcome.occurredAt.toLocaleString()}</Typography>
                      </Stack>
                      {outcome.notes ? <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{outcome.notes}</Typography> : null}
                    </Box>
                  ))}
                </Stack>
              ) : (
                <EmptyState title="No outcomes recorded" body="Record applied, screen, rejection, ghosted, offer, or closed events here." />
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h3">Application events</Typography>
              {application.events.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No events recorded yet.</Typography>
              ) : (
                application.events.map((event) => (
                  <Box key={event.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                      <Chip size="small" variant="outlined" label={event.type} />
                      <Typography variant="caption" color="text.secondary">{event.createdAt.toLocaleString()}</Typography>
                    </Stack>
                  </Box>
                ))
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </AppShell>
  );
}

function Metric({ label, value, helper }: { label: string; value: React.ReactNode; helper: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Box sx={{ mt: 0.75 }}>{value}</Box>
        <Typography variant="caption" color="text.secondary">{helper}</Typography>
      </CardContent>
    </Card>
  );
}

function MaterialCard({ title, icon, body, emptyTitle, emptyBody, actions }: { title: string; icon: React.ReactNode; body: string; emptyTitle: string; emptyBody: string; actions?: React.ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {icon}
              <Typography variant="h3">{title}</Typography>
            </Stack>
            {actions ? <Stack direction="row" spacing={0.5}>{actions}</Stack> : null}
          </Stack>
          <Divider />
          {body ? (
            <Typography
              component="pre"
              sx={{
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                color: "text.secondary",
                m: 0,
                maxHeight: 640,
                overflow: "auto",
              }}
            >
              {body}
            </Typography>
          ) : (
            <EmptyState title={emptyTitle} body={emptyBody} />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function SignalSection({ title, items, color }: { title: string; items: string[]; color: "primary" | "success" | "warning" }) {
  if (!items.length) return null;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>{title}</Typography>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
        {items.map((item) => <Chip key={`${title}-${item}`} size="small" color={color} variant="outlined" label={item} />)}
      </Stack>
    </Box>
  );
}

function PrepList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>{title}</Typography>
      <Stack component="ul" spacing={0.75} sx={{ mt: 1, pl: 2.5 }}>
        {items.map((item) => (
          <Typography key={`${title}-${item}`} component="li" variant="body2" color="text.secondary">
            {item}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}

function materialNotes(value: unknown): MaterialNotes {
  return value && typeof value === "object" && !Array.isArray(value) ? value as MaterialNotes : {};
}

function interviewPrepOutput(value: unknown): InterviewPrepOutput | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as InterviewPrepOutput : null;
}

function recruiterQualityReview(value: unknown): RecruiterQualityReview | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecruiterQualityReview : null;
}

function portfolioMatchOutput(value: unknown): PortfolioMatchOutput | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PortfolioMatchOutput : null;
}

function companyResearchOutput(value: unknown): CompanyResearchOutput | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CompanyResearchOutput : null;
}

function compensationOpportunityOutput(value: unknown): CompensationOpportunityOutput | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CompensationOpportunityOutput : null;
}

function formatAction(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatOutcome(outcome: string) {
  return outcome
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
