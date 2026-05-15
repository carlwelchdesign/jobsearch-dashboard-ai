import ConnectWithoutContactOutlinedIcon from "@mui/icons-material/ConnectWithoutContactOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { NetworkingStrategyPanel } from "./networking-strategy-panel";
import type { NetworkingStrategyPanelOutput } from "./networking-strategy-panel";

export const dynamic = "force-dynamic";

export default async function NetworkingPage() {
  const [outreach, contacts, latestStrategyRun] = await Promise.all([
    prisma.recruiterOutreach.findMany({
      include: {
        contact: true,
        jobPosting: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 80,
    }),
    prisma.contact.findMany({
      orderBy: [{ company: "asc" }, { updatedAt: "desc" }],
      take: 80,
    }),
    prisma.agentRun.findFirst({
      where: {
        agentType: "NETWORKING_STRATEGY",
        status: "COMPLETED",
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Recruiter targeting"
          title="Networking"
          description="Review recruiter contacts and outreach drafts. The system can draft messages, but sending stays manual."
        />

        <NetworkingStrategyPanel latest={isRecord(latestStrategyRun?.outputJson) ? latestStrategyRun.outputJson as NetworkingStrategyPanelOutput : null} />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" }, gap: 2 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <ConnectWithoutContactOutlinedIcon />
                  <Typography variant="h3">Outreach drafts</Typography>
                </Stack>
                {outreach.length === 0 ? (
                  <EmptyState title="No outreach drafts yet" body="Open an application packet and draft a recruiter note when a role is worth a human follow-up." />
                ) : (
                  outreach.map((draft) => (
                    <Box key={draft.id} sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
                      <Stack spacing={1.25}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                          <Box>
                            <Typography sx={{ fontWeight: 850 }}>
                              {draft.jobPosting ? `${draft.jobPosting.company} · ${draft.jobPosting.title}` : draft.contact?.company ?? "General outreach"}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {draft.contact ? `${draft.contact.name}${draft.contact.title ? `, ${draft.contact.title}` : ""}` : "No contact attached"}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                            <StatusChip status={draft.status} />
                            <Chip size="small" variant="outlined" label={`${jsonArray(draft.evidenceRefs).length} evidence refs`} />
                            {draft.jobPosting ? <ActionButton href={`/jobs/${draft.jobPosting.id}`} size="small" endIcon={<OpenInNewIcon />}>Job</ActionButton> : null}
                          </Stack>
                        </Stack>
                        <Typography
                          component="pre"
                          sx={{ whiteSpace: "pre-wrap", fontFamily: "inherit", color: "text.secondary", m: 0 }}
                        >
                          {draft.message}
                        </Typography>
                      </Stack>
                    </Box>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h3">Contacts</Typography>
                {contacts.length === 0 ? (
                  <EmptyState title="No contacts saved" body="Contacts can be attached to applications so outreach drafts address the right person." />
                ) : (
                  contacts.map((contact) => (
                    <Box key={contact.id} sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>
                      <Typography sx={{ fontWeight: 800 }}>{contact.name}</Typography>
                      <Typography variant="body2" color="text.secondary">{contact.company}{contact.title ? ` · ${contact.title}` : ""}</Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                        {contact.email ? <Chip size="small" variant="outlined" label={contact.email} /> : null}
                        {contact.linkedinUrl ? <ActionButton href={contact.linkedinUrl} size="small" endIcon={<OpenInNewIcon />}>LinkedIn</ActionButton> : null}
                      </Stack>
                    </Box>
                  ))
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>
    </AppShell>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
