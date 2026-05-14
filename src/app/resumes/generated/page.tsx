import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import Box from "@mui/material/Box";
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
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ScoreChip } from "@/components/ui/score-chip";
import { WorkflowGuide } from "@/components/ui/workflow-guide";
import { prisma } from "@/lib/prisma";
import { RegenerateResumeButton } from "./regenerate-resume-button";

export const dynamic = "force-dynamic";

type AtsChecks = {
  score?: number;
  warnings?: string[];
  textExtractable?: boolean;
};

export default async function GeneratedResumesPage() {
  const [resumes, coverLetters] = await Promise.all([
    prisma.generatedResume.findMany({
      include: {
        jobPosting: {
          include: {
            coverLetters: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
        user: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.generatedCoverLetter.findMany({
      include: {
        jobPosting: true,
        user: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const latestResumeCreatedAtByJobId = new Map<string, number>();
  for (const resume of resumes) {
    const current = latestResumeCreatedAtByJobId.get(resume.jobPosting.id) ?? 0;
    latestResumeCreatedAtByJobId.set(resume.jobPosting.id, Math.max(current, resume.createdAt.getTime()));
  }

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Resume atelier"
          title="Generated Materials"
          description="Step 3 output: review generated resumes and cover letters before complete packages move into the ready queue."
        />
        <WorkflowGuide
          active="materials"
          title="Step 3 of 5: review generated materials"
          stepOverrides={{
            materials: {
              body: "Review tailored resume exports and generated cover letters here before working complete packages in Applications.",
              action: "View materials",
            },
            applications: {
              body: "Complete packages with resume and cover letter are tracked in Applications.",
            },
          }}
        />
        <TableContainer
          component={Card}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
            overflow: "hidden",
          }}
        >
          <Table sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    bgcolor: "rgba(250, 248, 241, 0.82)",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    color: "text.secondary",
                    fontSize: 12,
                    fontWeight: 850,
                    letterSpacing: 0,
                    textTransform: "uppercase",
                  },
                }}
              >
                <TableCell>Resume</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>ATS score</TableCell>
                <TableCell>Cover letter</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {resumes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <EmptyState title="No generated resumes" body="Open an approved job and generate an ATS-friendly tailored resume." />
                  </TableCell>
                </TableRow>
              ) : (
                resumes.map((resume) => {
                  const atsChecks = resume.atsChecks as AtsChecks;
                  const coverLetter = resume.jobPosting.coverLetters[0];
                  return (
                    <TableRow
                      key={resume.id}
                      hover
                      sx={{
                        "& td": { py: 2.25 },
                        "&:last-child td": { borderBottom: 0 },
                      }}
                    >
                      <TableCell>
                        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                          <Box
                            aria-hidden
                            sx={{
                              width: 4,
                              height: 44,
                              bgcolor: "primary.main",
                              borderRadius: 999,
                              opacity: 0.75,
                            }}
                          />
                          <Box>
                            <Typography sx={{ fontWeight: 850, lineHeight: 1.25 }}>{resume.jobPosting.company}</Typography>
                            <Typography variant="body2" color="text.secondary">{resume.jobPosting.title}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Created {resume.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>v{resume.version}</TableCell>
                      <TableCell>{typeof atsChecks.score === "number" ? <ScoreChip score={atsChecks.score} /> : <Chip label="Unchecked" />}</TableCell>
                      <TableCell>
                        {coverLetter ? (
                          <Stack spacing={0.75}>
                            <Chip color="secondary" variant="outlined" label={`v${coverLetter.version} generated`} sx={{ width: "fit-content" }} />
                            <Stack direction="row" spacing={0.5}>
                              <ActionButton href={`/api/cover-letters/${coverLetter.id}/plain-text`} size="small" startIcon={<VisibilityOutlinedIcon />}>Text</ActionButton>
                              <ActionButton href={`/api/cover-letters/${coverLetter.id}/pdf`} size="small" startIcon={<DownloadOutlinedIcon />}>PDF</ActionButton>
                            </Stack>
                          </Stack>
                        ) : (
                          <Stack spacing={0.75}>
                            <Chip label="Not generated" sx={{ width: "fit-content" }} />
                            <ActionButton href={`/jobs/${resume.jobPosting.id}`} size="small">Open job</ActionButton>
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                          <RegenerateResumeButton
                            jobId={resume.jobPosting.id}
                            resumeId={resume.id}
                            latestResumeCreatedAtMs={latestResumeCreatedAtByJobId.get(resume.jobPosting.id) ?? resume.createdAt.getTime()}
                          />
                          <ActionButton href={`/api/resumes/generated/${resume.id}/plain-text`} size="small" startIcon={<VisibilityOutlinedIcon />}>Text</ActionButton>
                          <ActionButton href={`/api/resumes/generated/${resume.id}/pdf`} size="small" startIcon={<DownloadOutlinedIcon />}>PDF</ActionButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TableContainer
          component={Card}
          sx={{
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 24px 70px rgba(15, 23, 42, 0.08)",
            overflow: "hidden",
          }}
        >
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider", bgcolor: "rgba(250, 248, 241, 0.82)" }}>
            <Typography variant="h3">Generated Cover Letters</Typography>
            <Typography variant="body2" color="text.secondary">
              Review generated letters directly, or export a PDF for the application package.
            </Typography>
          </Box>
          <Table sx={{ minWidth: 940 }}>
            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    bgcolor: "rgba(250, 248, 241, 0.82)",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    color: "text.secondary",
                    fontSize: 12,
                    fontWeight: 850,
                    letterSpacing: 0,
                    textTransform: "uppercase",
                  },
                }}
              >
                <TableCell>Cover letter</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>Preview</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {coverLetters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <EmptyState title="No generated cover letters" body="Open an approved job and generate a cover letter, or prepare the full application package." />
                  </TableCell>
                </TableRow>
              ) : (
                coverLetters.map((coverLetter) => (
                  <TableRow
                    key={coverLetter.id}
                    hover
                    sx={{
                      "& td": { py: 2.25 },
                      "&:last-child td": { borderBottom: 0 },
                    }}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                        <Box
                          aria-hidden
                          sx={{
                            width: 4,
                            height: 44,
                            bgcolor: "secondary.main",
                            borderRadius: 999,
                            opacity: 0.75,
                          }}
                        />
                        <Box>
                          <Typography sx={{ fontWeight: 850, lineHeight: 1.25 }}>{coverLetter.jobPosting.company}</Typography>
                          <Typography variant="body2" color="text.secondary">{coverLetter.jobPosting.title}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Created {coverLetter.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>v{coverLetter.version}</TableCell>
                    <TableCell sx={{ maxWidth: 460 }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 3,
                          overflow: "hidden",
                        }}
                      >
                        {coverLetter.body}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                        <ActionButton href={`/api/cover-letters/${coverLetter.id}/plain-text`} size="small" startIcon={<VisibilityOutlinedIcon />}>Text</ActionButton>
                        <ActionButton href={`/api/cover-letters/${coverLetter.id}/pdf`} size="small" startIcon={<DownloadOutlinedIcon />}>PDF</ActionButton>
                        <ActionButton href={`/jobs/${coverLetter.jobPosting.id}`} size="small">Open job</ActionButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </AppShell>
  );
}
