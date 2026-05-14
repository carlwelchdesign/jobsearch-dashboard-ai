import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";

type WorkflowStepId = "profiles" | "jobs" | "materials" | "applications" | "sprint";

type WorkflowStep = {
  id: WorkflowStepId;
  number: string;
  title: string;
  body: string;
  href: string;
  action: string;
};

const steps: WorkflowStep[] = [
  {
    id: "profiles",
    number: "01",
    title: "Set profile",
    body: "Define target roles, locations, salary floor, and match threshold.",
    href: "/profiles",
    action: "Edit profiles",
  },
  {
    id: "jobs",
    number: "02",
    title: "Review jobs",
    body: "Run search, inspect matches, then approve or reject each job.",
    href: "/jobs",
    action: "Review queue",
  },
  {
    id: "materials",
    number: "03",
    title: "Generate materials",
    body: "Create the tailored resume, cover letter, and application package.",
    href: "/resumes/generated",
    action: "View resumes",
  },
  {
    id: "applications",
    number: "04",
    title: "Ready queue",
    body: "Confirm the package is complete before launching the apply flow.",
    href: "/applications",
    action: "Open tracker",
  },
  {
    id: "sprint",
    number: "05",
    title: "Apply sprint",
    body: "Open the employer site, review the filled form, submit manually.",
    href: "/applications/assistant",
    action: "Start sprint",
  },
];

type WorkflowGuideProps = {
  active?: WorkflowStepId;
  title?: string;
  stepOverrides?: Partial<Record<WorkflowStepId, Partial<Pick<WorkflowStep, "title" | "body" | "href" | "action">>>>;
};

export function WorkflowGuide({ active, title = "Workflow", stepOverrides = {} }: WorkflowGuideProps) {
  return (
    <Card
      sx={{
        borderColor: "rgba(104, 85, 52, 0.22)",
        bgcolor: "rgba(255, 252, 245, 0.78)",
        boxShadow: "0 24px 70px rgba(15, 23, 42, 0.07)",
      }}
    >
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
          <Box>
            <Typography variant="overline" color="primary" sx={{ fontWeight: 900, letterSpacing: 0 }}>
              Operating path
            </Typography>
            <Typography variant="h3">{title}</Typography>
          </Box>
          <Chip variant="outlined" color="success" label="Manual submission stays required" sx={{ alignSelf: { xs: "flex-start", sm: "center" } }} />
        </Stack>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(5, 1fr)" } }}>
        {steps.map((baseStep, index) => {
          const step = { ...baseStep, ...stepOverrides[baseStep.id] };
          const selected = step.id === active;
          return (
            <Box
              key={step.id}
              sx={{
                p: 2,
                minHeight: 178,
                borderRight: { md: index < steps.length - 1 ? 1 : 0 },
                borderBottom: { xs: index < steps.length - 1 ? 1 : 0, md: 0 },
                borderColor: "divider",
                bgcolor: selected ? "rgba(15, 118, 110, 0.08)" : "transparent",
              }}
            >
              <Stack spacing={1.25} sx={{ height: "100%" }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="caption" color={selected ? "primary.dark" : "text.secondary"} sx={{ fontWeight: 900 }}>
                    {step.number}
                  </Typography>
                  {selected ? <Chip size="small" color="primary" label="Here" /> : null}
                </Stack>
                <Box>
                  <Typography sx={{ fontWeight: 850, lineHeight: 1.2 }}>{step.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    {step.body}
                  </Typography>
                </Box>
                <Box sx={{ flexGrow: 1 }} />
                <Button component={Link} href={step.href} size="small" endIcon={<ArrowForwardOutlinedIcon />} sx={{ alignSelf: "flex-start" }}>
                  {step.action}
                </Button>
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Card>
  );
}
