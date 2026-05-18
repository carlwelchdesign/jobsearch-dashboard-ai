export const metadata = {
  title: "Networking | Job Search OS",
  description: "Plan recruiter outreach and networking strategy for target roles.",
};

import ConnectWithoutContactOutlinedIcon from "@mui/icons-material/ConnectWithoutContactOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
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
      orderBy: [{ relevanceScore: "desc" }, { company: "asc" }, { updatedAt: "desc" }],
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
  const latestStrategy = isRecord(latestStrategyRun?.outputJson) ? latestStrategyRun.outputJson as NetworkingStrategyPanelOutput : null;
  const nextAction = networkingNextAction({
    draftCount: outreach.filter((item) => item.status === "DRAFT").length,
    dueFollowUpCount: outreach.filter((item) => item.status === "SENT" && item.followUpAt && item.followUpAt <= new Date()).length,
    contactCount: contacts.length,
    strategyRunAt: latestStrategyRun?.createdAt ?? null,
    strategyActionCount: latestStrategy?.actionItems?.length ?? 0,
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Recruiter targeting"
          title="Networking"
          description="Review recruiter contacts and outreach drafts. The system can draft messages, but sending stays manual."
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
              <ActionButton href={nextAction.href} postTo={nextAction.postTo} variant="contained" color={nextAction.color} startIcon={nextAction.icon}>
                {nextAction.label}
              </ActionButton>
            </Stack>
          </CardContent>
        </Card>

        <NetworkingStrategyPanel latest={latestStrategy} />

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
                        {contact.relevanceScore > 0 ? <Chip size="small" color="primary" variant="outlined" label={`${contact.relevanceScore}% relevant`} /> : null}
                        {contact.source ? <Chip size="small" variant="outlined" label={contact.source} /> : null}
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

function networkingNextAction({
  draftCount,
  dueFollowUpCount,
  contactCount,
  strategyRunAt,
  strategyActionCount,
}: {
  draftCount: number;
  dueFollowUpCount: number;
  contactCount: number;
  strategyRunAt: Date | null;
  strategyActionCount: number;
}) {
  if (dueFollowUpCount > 0) {
    return {
      title: "Handle due follow-ups",
      detail: "Outreach follow-ups are due. Review the drafts and update status after sending manually.",
      label: "Review outreach",
      href: "/networking",
      color: "warning" as const,
      icon: <ConnectWithoutContactOutlinedIcon />,
      count: dueFollowUpCount,
    };
  }
  if (draftCount > 0) {
    return {
      title: "Review outreach drafts",
      detail: "Drafts are ready for human review. Nothing is sent automatically.",
      label: "Review drafts",
      href: "/networking",
      color: "primary" as const,
      icon: <EditNoteOutlinedIcon />,
      count: draftCount,
    };
  }
  if (isOlderThanDays(strategyRunAt, 7) || strategyActionCount === 0) {
    return {
      title: "Plan networking",
      detail: "Generate a short strategy from open applications, contacts, follow-ups, and outreach history.",
      label: "Plan networking",
      postTo: "/api/networking/strategy",
      color: "primary" as const,
      icon: <PsychologyOutlinedIcon />,
      count: contactCount,
    };
  }
  return {
    title: "Generate targeted outreach",
    detail: "Open application packets worth human follow-up and draft recruiter or hiring-manager notes from approved evidence.",
    label: "Open applications",
    href: "/applications",
    color: "primary" as const,
    icon: <ConnectWithoutContactOutlinedIcon />,
    count: contactCount,
  };
}

function isOlderThanDays(date: Date | null, days: number) {
  if (!date) return true;
  return Date.now() - date.getTime() > days * 86_400_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
