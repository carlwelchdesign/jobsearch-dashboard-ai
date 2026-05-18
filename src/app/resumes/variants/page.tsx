export const metadata = {
  title: "Resume Variants | Job Search OS",
  description: "Manage reusable resume profiles and tailored positioning variants.",
};

import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { ResumeProfileStatusButton, SeedResumeProfilesButton } from "./resume-profile-actions";

export const dynamic = "force-dynamic";

export default async function ResumeVariantsPage() {
  const profiles = await prisma.resumeProfile.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const activeCount = profiles.filter((profile) => profile.status === "ACTIVE").length;

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Resume strategy"
          title="Resume Variants"
          description="Controlled resume profiles keep application materials consistent. The strategy agent chooses among active variants instead of inventing one-off positioning."
          actions={<SeedResumeProfilesButton />}
        />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
          <Metric label="Variants" value={profiles.length.toString()} helper="Controlled profiles" />
          <Metric label="Active" value={activeCount.toString()} helper="Available to strategy agent" />
          <Metric label="Archived" value={(profiles.length - activeCount).toString()} helper="Hidden from selection" />
        </Box>

        {profiles.length === 0 ? (
          <Card>
            <EmptyState title="No resume variants yet" body="Seed the default variants to create controlled positioning for Security, AI Product, Defense UI, Design Systems, Full-Stack SaaS, and Senior Frontend roles." />
          </Card>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 2 }}>
            {profiles.map((profile) => (
              <Card key={profile.id}>
                <CardContent>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "flex-start" } }}>
                      <Box>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                          <AutoAwesomeOutlinedIcon color="primary" />
                          <Typography variant="h3">{profile.name}</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{profile.description}</Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Chip size="small" color={profile.status === "ACTIVE" ? "success" : "default"} label={profile.status.toLowerCase()} />
                        <ResumeProfileStatusButton id={profile.id} status={profile.status} />
                      </Stack>
                    </Stack>

                    <Typography color="text.secondary">{profile.positioningSummary}</Typography>
                    <ChipSection title="Target roles" items={jsonArray(profile.targetRoles)} color="primary" />
                    <ChipSection title="Evidence tags" items={jsonArray(profile.evidenceTags)} color="success" />
                    <ChipSection title="Priority projects" items={jsonArray(profile.priorityProjects)} color="warning" />
                    <Typography variant="caption" color="text.secondary">
                      Sections: {jsonArray(profile.defaultSections).join(", ")}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Stack>
    </AppShell>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h1" sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{helper}</Typography>
      </CardContent>
    </Card>
  );
}

function ChipSection({ title, items, color }: { title: string; items: string[]; color: "primary" | "success" | "warning" }) {
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
