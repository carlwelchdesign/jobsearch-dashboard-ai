export const metadata = {
  title: "Architecture | Job Search OS",
  description: "Review the system architecture map, agent boundaries, and repo-evidence risks.",
};

import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import SchemaOutlinedIcon from "@mui/icons-material/SchemaOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { SystemArchitectureOutput } from "@/lib/agents/system-architecture";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ArchitecturePage() {
  const latestRun = await prisma.agentRun.findFirst({
    where: { agentType: "SYSTEM_ARCHITECTURE", status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { events: { orderBy: { createdAt: "desc" }, take: 3 } },
  });
  const report = outputObject(latestRun?.outputJson);
  const metrics = report?.metrics;

  return (
    <>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="System map"
          title="Architecture"
          description="Inspect how routes, agents, workflows, skills, docs, and Prisma memory connect. The architecture agent is read-only and stores its report as an AgentRun."
          actions={(
            <ActionButton postTo="/api/architecture" variant="contained" startIcon={<AutoFixHighOutlinedIcon />} loadingLabel="Mapping...">
              Refresh map
            </ActionButton>
          )}
        />

        {report ? (
          <>
            <Card sx={{ borderColor: primaryRisk(report)?.severity === "high" ? "error.main" : primaryRisk(report)?.severity === "medium" ? "warning.main" : "success.main" }}>
              <CardContent>
                <Stack direction={{ xs: "column", lg: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { lg: "center" } }}>
                  <Box>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                      <Chip size="small" color="primary" label="Latest architecture run" />
                      <Chip size="small" variant="outlined" label={latestRun?.createdAt.toLocaleString() ?? "Unknown time"} />
                      {primaryRisk(report) ? <Chip size="small" color={riskColor(primaryRisk(report)?.severity)} label={`${primaryRisk(report)?.severity} signal`} /> : null}
                    </Stack>
                    <Typography variant="h3">{report.summary}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      {report.recommendedDecisions[0] ?? "Keep architecture evidence refreshed as agents and workflows change."}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                    <Metric icon={<AccountTreeOutlinedIcon />} label="Routes" value={`${metrics?.appRoutes ?? 0}/${metrics?.apiRoutes ?? 0}`} helper="pages/API" />
                    <Metric icon={<HubOutlinedIcon />} label="Agents" value={(metrics?.agentTypes ?? 0).toString()} helper="AgentType values" />
                    <Metric icon={<SchemaOutlinedIcon />} label="Models" value={(metrics?.prismaModels ?? 0).toString()} helper="Prisma memory" />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.25fr 0.75fr" }, gap: 2 }}>
              <Card>
                <CardContent>
                  <Stack spacing={2}>
                    <SectionTitle title="Connected system map" detail={`${report.nodes.length} nodes / ${report.edges.length} evidence links`} />
                    <ArchitectureMap report={report} />
                  </Stack>
                </CardContent>
              </Card>

              <Stack spacing={2}>
                <Card>
                  <CardContent>
                    <Stack spacing={1.5}>
                      <SectionTitle title="Architecture risks" detail="Ranked from repo evidence" />
                      {report.risks.map((risk) => (
                        <Box key={risk.title} sx={{ borderLeft: 3, borderColor: `${riskColor(risk.severity)}.main`, pl: 1.25 }}>
                          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 0.5 }}>
                            <WarningAmberOutlinedIcon color={riskColor(risk.severity)} fontSize="small" />
                            <Typography sx={{ fontWeight: 900 }}>{risk.title}</Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary">{risk.detail}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>{risk.recommendation}</Typography>
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <Stack spacing={1.5}>
                      <SectionTitle title="Decisions to hold" detail="Architecture guardrails for future work" />
                      {report.recommendedDecisions.map((decision) => (
                        <Typography key={decision} variant="body2" sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                          {decision}
                        </Typography>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
              <Card>
                <CardContent>
                  <Stack spacing={1.5}>
                    <SectionTitle title="Workflow lanes" detail="How work moves through the system" />
                    {report.workflows.map((workflow) => (
                      <Box key={workflow.name} sx={{ borderTop: 1, borderColor: "divider", pt: 1.25 }}>
                        <Typography sx={{ fontWeight: 900 }}>{workflow.name}</Typography>
                        <Typography variant="body2" color="text.secondary">{workflow.steps.join(" -> ")}</Typography>
                        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                          {workflow.evidence.map((item) => <Chip key={item} size="small" variant="outlined" label={item} />)}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Stack spacing={1.5}>
                    <SectionTitle title="Documentation evidence" detail="Files feeding the architecture map" />
                    {report.documentation.map((doc) => (
                      <Box key={doc.path} sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                        <Typography sx={{ fontWeight: 850 }}>{doc.path}</Typography>
                        <Typography variant="caption" color="text.secondary">{doc.summary}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          </>
        ) : (
          <EmptyState
            title="No architecture report yet"
            body="Run the architecture agent to map routes, agents, Prisma models, skills, docs, and workflow risks from repo evidence."
          />
        )}
      </Stack>
    </>
  );
}

function ArchitectureMap({ report }: { report: SystemArchitectureOutput }) {
  const featuredNodes = report.nodes.filter((node) => ["workflow", "data", "skill", "doc"].includes(node.kind)).concat(report.nodes.filter((node) => node.kind === "agent").slice(0, 10));
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1 }}>
      {featuredNodes.map((node) => (
        <Box key={node.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, minHeight: 112 }}>
          <Stack spacing={0.75}>
            <Chip size="small" color={nodeColor(node.kind)} label={node.kind} sx={{ alignSelf: "flex-start" }} />
            <Typography sx={{ fontWeight: 900, lineHeight: 1.15 }}>{node.label}</Typography>
            <Typography variant="caption" color="text.secondary">{node.summary}</Typography>
          </Stack>
        </Box>
      ))}
    </Box>
  );
}

function Metric({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string; helper: string }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, minWidth: 128, bgcolor: "background.paper" }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        {icon}
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{label}</Typography>
          <Typography sx={{ fontSize: 24, lineHeight: 1, fontWeight: 950, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
          <Typography variant="caption" color="text.secondary">{helper}</Typography>
        </Box>
      </Stack>
    </Box>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <Box>
      <Typography variant="h3">{title}</Typography>
      <Typography variant="body2" color="text.secondary">{detail}</Typography>
    </Box>
  );
}

function outputObject(value: unknown): SystemArchitectureOutput | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SystemArchitectureOutput : null;
}

function primaryRisk(report: SystemArchitectureOutput) {
  return report.risks[0] ?? null;
}

function riskColor(severity: string | undefined): "error" | "warning" | "success" {
  if (severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "success";
}

function nodeColor(kind: string): "primary" | "secondary" | "success" | "warning" | "info" | "default" {
  if (kind === "workflow") return "primary";
  if (kind === "agent") return "success";
  if (kind === "data") return "warning";
  if (kind === "skill") return "secondary";
  if (kind === "api") return "info";
  return "default";
}
