import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
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
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type AtsChecks = {
  score?: number;
  warnings?: string[];
  textExtractable?: boolean;
};

export default async function GeneratedResumesPage() {
  const resumes = await prisma.generatedResume.findMany({
    include: {
      jobPosting: true,
      user: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="ATS artifacts"
          title="Generated Resumes"
          description="Review generated resumes, plain text, selected bullets, PDF exports, and ATS readability checks."
        />
        <TableContainer component={Card}>
          <Table sx={{ minWidth: 860 }}>
            <TableHead>
              <TableRow>
                <TableCell>Company / Role</TableCell>
                <TableCell>Version</TableCell>
                <TableCell>ATS score</TableCell>
                <TableCell>PDF</TableCell>
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
                  return (
                    <TableRow key={resume.id} hover>
                      <TableCell>
                        <Typography sx={{ fontWeight: 800 }}>{resume.jobPosting.company}</Typography>
                        <Typography variant="body2" color="text.secondary">{resume.jobPosting.title}</Typography>
                      </TableCell>
                      <TableCell>v{resume.version}</TableCell>
                      <TableCell>{typeof atsChecks.score === "number" ? <ScoreChip score={atsChecks.score} /> : <Chip label="Unchecked" />}</TableCell>
                      <TableCell><Chip variant="outlined" color="success" label="Downloadable" /></TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                          <ActionButton postTo={`/api/jobs/${resume.jobPosting.id}/generate-resume`} size="small" startIcon={<AutorenewOutlinedIcon />} message="Resume regenerated">Regenerate</ActionButton>
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
      </Stack>
    </AppShell>
  );
}
