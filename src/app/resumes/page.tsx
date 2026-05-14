import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import GradingOutlinedIcon from "@mui/icons-material/GradingOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { AppShell } from "@/app/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { WorkflowGuide } from "@/components/ui/workflow-guide";

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
];

export default function ResumesPage() {
  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Resume intelligence"
          title="Resume Workspace"
          description="Step 3 support: upload evidence, approve parsed profile data, and review the generated resumes used in application packages."
        />
        <WorkflowGuide active="materials" title="Step 3 of 5: keep resume evidence clean" />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(4, 1fr)" }, gap: 2 }}>
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
