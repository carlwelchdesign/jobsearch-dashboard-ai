export const metadata = {
  title: "Resumes | Job Search OS",
  description: "Manage resumes, profile evidence, generated materials, and variants.",
};

import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import GradingOutlinedIcon from "@mui/icons-material/GradingOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { AppShell } from "@/app/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";

const sections = [
  {
    title: "Upload Resume",
    href: "/resumes/upload",
    icon: FileUploadOutlinedIcon,
    description: "Upload PDF, DOCX, Markdown, or text and extract readable resume content.",
  },
  {
    title: "Review Parsed Profile",
    href: "/resumes/review",
    icon: GradingOutlinedIcon,
    description: "Approve parsed profile data before it becomes a source of truth.",
  },
  {
    title: "Candidate Profile",
    href: "/resumes/profile",
    icon: FactCheckOutlinedIcon,
    description: "Manage skills, work experience, projects, and verified bullets.",
  },
  {
    title: "Generated Resumes",
    href: "/resumes/generated",
    icon: ArticleOutlinedIcon,
    description: "Review ATS checks, plain text, and exported resumes tied to jobs.",
  },
  {
    title: "Resume Variants",
    href: "/resumes/variants",
    icon: AutoAwesomeOutlinedIcon,
    description: "Manage controlled positioning profiles used by the resume strategy agent.",
  },
];

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const [uploadCount, pendingUploadCount, profileCount, variantCount, generatedCount] = await Promise.all([
    prisma.resumeUpload.count(),
    prisma.resumeUpload.count({ where: { parsingStatus: { in: ["pending", "parsed", "needs_review"] } } }),
    prisma.userProfile.count(),
    prisma.resumeProfile.count({ where: { status: "ACTIVE" } }),
    prisma.generatedResume.count(),
  ]);
  const nextAction = resumesNextAction({ uploadCount, pendingUploadCount, profileCount, variantCount, generatedCount });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Resume intelligence"
          title="Resume Workspace"
          description="Manage the evidence and resume source data agents use for truthful packets, interview prep, recruiter messages, and role-specific positioning."
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
              <Button component={Link} href={nextAction.href} variant="contained" color={nextAction.color} startIcon={nextAction.icon}>
                {nextAction.label}
              </Button>
            </Stack>
          </CardContent>
        </Card>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(5, 1fr)" }, gap: 2 }}>
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.href} sx={{ transition: "border-color 160ms ease, transform 160ms ease", "&:hover": { borderColor: "primary.main", transform: "translateY(-1px)" } }}>
                <CardContent>
                  <Icon color="primary" />
                  <Typography variant="h3" sx={{ mt: 2 }}>{section.title}</Typography>
                  <Typography color="text.secondary" sx={{ mt: 1 }}>{section.description}</Typography>
                </CardContent>
                <CardActions>
                  <Button component={Link} href={section.href}>Open</Button>
                </CardActions>
              </Card>
            );
          })}
        </Box>
      </Stack>
    </AppShell>
  );
}

function resumesNextAction({
  uploadCount,
  pendingUploadCount,
  profileCount,
  variantCount,
  generatedCount,
}: {
  uploadCount: number;
  pendingUploadCount: number;
  profileCount: number;
  variantCount: number;
  generatedCount: number;
}) {
  if (uploadCount === 0) {
    return {
      title: "Upload your source resume",
      detail: "Start by uploading a resume so the app can extract profile facts and create approved evidence.",
      label: "Upload resume",
      href: "/resumes/upload",
      color: "primary" as const,
      icon: <FileUploadOutlinedIcon />,
      count: uploadCount,
    };
  }
  if (pendingUploadCount > 0) {
    return {
      title: "Review parsed resume data",
      detail: "Parsed resume data needs approval before it becomes part of the truth layer.",
      label: "Review parsed data",
      href: "/resumes/review",
      color: "warning" as const,
      icon: <GradingOutlinedIcon />,
      count: pendingUploadCount,
    };
  }
  if (profileCount === 0) {
    return {
      title: "Build candidate profile",
      detail: "Confirm skills, work history, projects, and verified bullets before generating materials.",
      label: "Open profile",
      href: "/resumes/profile",
      color: "primary" as const,
      icon: <FactCheckOutlinedIcon />,
      count: profileCount,
    };
  }
  if (variantCount === 0) {
    return {
      title: "Seed resume variants",
      detail: "Create controlled positioning variants so the resume strategy agent chooses from stable profiles.",
      label: "Open variants",
      href: "/resumes/variants",
      color: "primary" as const,
      icon: <AutoAwesomeOutlinedIcon />,
      count: variantCount,
    };
  }
  return {
    title: generatedCount > 0 ? "Review generated materials" : "Generate materials from approved jobs",
    detail: generatedCount > 0 ? "Review generated resumes, cover letters, ATS checks, and QA signals." : "Approve jobs and generate tailored resumes and cover letters.",
    label: generatedCount > 0 ? "Open generated materials" : "Open jobs",
    href: generatedCount > 0 ? "/resumes/generated" : "/jobs",
    color: "primary" as const,
    icon: generatedCount > 0 ? <ArticleOutlinedIcon /> : <FactCheckOutlinedIcon />,
    count: generatedCount,
  };
}
