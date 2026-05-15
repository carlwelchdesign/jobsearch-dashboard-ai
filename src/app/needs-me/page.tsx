import MarkChatUnreadOutlinedIcon from "@mui/icons-material/MarkChatUnreadOutlined";
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
import { agentUserRequestHref, agentUserRequestTypeLabel, listOpenAgentUserRequests } from "@/lib/agent-user-requests";

export const dynamic = "force-dynamic";

export default async function NeedsMePage() {
  const requests = await listOpenAgentUserRequests(80);

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Agent blockers"
          title="Needs Me"
          description="Questions and blockers agents cannot resolve safely on their own. Answer or dismiss these to keep workflows moving."
        />

        {requests.length === 0 ? (
          <Card>
            <EmptyState title="No open requests" body="When an agent needs a decision, missing answer, or manual intervention, it will appear here." />
          </Card>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" }, gap: 2 }}>
            {requests.map((request) => {
              const job = request.application?.jobPosting ?? request.jobPosting;

              return (
                <Card key={request.id} sx={{ borderColor: request.type === "APPLICATION_BLOCKED" ? "warning.main" : "divider" }}>
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        <Chip size="small" color="warning" icon={<MarkChatUnreadOutlinedIcon />} label={agentUserRequestTypeLabel(request.type)} />
                        <Chip size="small" variant="outlined" label={request.createdAt.toLocaleString()} />
                      </Stack>

                      {job ? (
                        <Box>
                          <Typography sx={{ fontWeight: 850 }}>{job.company}</Typography>
                          <Typography variant="body2" color="text.secondary">{job.title}</Typography>
                        </Box>
                      ) : null}

                      <Typography variant="h3">{request.question}</Typography>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                        <ActionButton href={agentUserRequestHref(request)} size="small" variant="outlined" endIcon={<OpenInNewIcon />}>
                          Open context
                        </ActionButton>
                        <Stack direction="row" spacing={1}>
                          <ActionButton
                            postTo={`/api/agent-user-requests/${request.id}/resolve`}
                            body={{ status: "DISMISSED" }}
                            size="small"
                            color="secondary"
                            variant="outlined"
                          >
                            Dismiss
                          </ActionButton>
                          <ActionButton
                            postTo={`/api/agent-user-requests/${request.id}/resolve`}
                            body={{ status: "RESOLVED" }}
                            size="small"
                            variant="contained"
                          >
                            Mark resolved
                          </ActionButton>
                        </Stack>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </Stack>
    </AppShell>
  );
}
