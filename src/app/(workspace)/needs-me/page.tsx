export const metadata = {
  title: "Needs Me | Job Search OS",
  description: "Resolve open agent questions and workflow blockers.",
};

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PriorityHighOutlinedIcon from "@mui/icons-material/PriorityHighOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/ui/page-header";
import { agentUserRequestHref, agentUserRequestTypeLabel, listOpenAgentUserRequests } from "@/lib/agent-user-requests";
import { prisma } from "@/lib/prisma";
import { getServiceFallbacks } from "@/lib/service-fallbacks";
import { ServiceFallbackBanners } from "@/components/ui/service-fallback-banners";
import { NeedsMeLiveRefresh } from "./needs-me-live-refresh";
import { NeedsMeTable, type NeedsMeTableRequest } from "./needs-me-table";

export const dynamic = "force-dynamic";

export default async function NeedsMePage() {
  const [requests, emailConnection, userWithNotifications] = await Promise.all([
    listOpenAgentUserRequests(80),
    prisma.emailOAuthConnection.findFirst({ select: { id: true } }),
    prisma.user.findFirst({ select: { notificationSettings: true } }),
  ]);
  const nextRequest = prioritizeRequest(requests);
  const tableRequests: NeedsMeTableRequest[] = requests.map((request) => {
    const job = request.application?.jobPosting ?? request.jobPosting;

    return {
      id: request.id,
      type: request.type,
      typeLabel: agentUserRequestTypeLabel(request.type),
      question: request.question,
      createdAt: request.createdAt.toLocaleString(),
      href: agentUserRequestHref(request),
      job: job ? { company: job.company, title: job.title } : null,
      canAnswer: request.type === "UNKNOWN_ANSWER" || request.type === "EMAIL_REVIEW" || request.type === "INTERVIEW_PREP" || request.type === "FOLLOW_UP_DUE",
      canSaveMemory: request.type === "UNKNOWN_ANSWER",
    };
  });

  const ns = userWithNotifications?.notificationSettings as { pushoverEnabled?: boolean; emailEnabled?: boolean } | null;
  const anyNotificationConfigured = Boolean(ns?.pushoverEnabled || ns?.emailEnabled);
  const fallbacks = getServiceFallbacks(["email_sync", "notifications"], {
    anyEmailSyncConnected: Boolean(emailConnection),
    anyNotificationConfigured,
  });

  return (
    <>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Agent blockers"
          title="Needs Me"
          description="Questions and blockers agents cannot resolve safely on their own. Answer or dismiss these to keep workflows moving."
        />
        <ServiceFallbackBanners items={fallbacks} />
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <NeedsMeLiveRefresh />
        </Stack>

        <Card sx={{ borderColor: nextRequest ? "warning.main" : "success.main", bgcolor: nextRequest ? "rgba(245, 158, 11, 0.08)" : "rgba(16, 185, 129, 0.08)" }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Chip size="small" color={nextRequest ? "warning" : "success"} icon={nextRequest ? <PriorityHighOutlinedIcon /> : undefined} label="Next action" />
                  {requests.length ? <Chip size="small" variant="outlined" label={requests.length} /> : null}
                </Stack>
                <Typography variant="h3">{nextRequest ? "Resolve the top blocker" : "No blockers waiting"}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {nextRequest ? nextRequest.question : "Agents can keep working without a human answer right now."}
                </Typography>
              </Box>
              {nextRequest ? (
                <ActionButton href={agentUserRequestHref(nextRequest)} variant="contained" color="warning" endIcon={<OpenInNewIcon />}>
                  Open context
                </ActionButton>
              ) : (
                <ActionButton href="/dashboard" variant="contained" color="success">
                  Open dashboard
                </ActionButton>
              )}
            </Stack>
          </CardContent>
        </Card>

        <NeedsMeTable requests={tableRequests} />
      </Stack>
    </>
  );
}

function prioritizeRequest<T extends { type: string; createdAt: Date }>(requests: T[]) {
  return requests.reduce<T | null>((best, request) => {
    if (!best) return request;
    const requestPriorityValue = requestPriority(request.type);
    const bestPriorityValue = requestPriority(best.type);
    if (requestPriorityValue < bestPriorityValue) return request;
    if (requestPriorityValue > bestPriorityValue) return best;
    return request.createdAt < best.createdAt ? request : best;
  }, null);
}

function requestPriority(type: string) {
  if (type === "APPLICATION_BLOCKED") return 1;
  if (type === "UNKNOWN_ANSWER") return 2;
  if (type === "INTERVIEW_PREP") return 3;
  return 4;
}
