import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionButton } from "@/components/action-button";
import { ScoreChip } from "@/components/ui/score-chip";
import type { MarketIntelligenceOutput } from "@/lib/agents/market-intelligence";

export function MarketIntelligencePanel({ latest }: { latest: MarketIntelligenceOutput | null }) {
  const topLane = latest?.marketTemperature?.[0] ?? null;
  const topSkills = latest?.skillSignals?.slice(0, 6) ?? [];

  return (
    <Card sx={{ borderColor: "info.main", bgcolor: "rgba(2, 132, 199, 0.06)" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                <Chip size="small" color="info" label="Market intelligence" />
                {latest ? <Chip size="small" variant="outlined" label={`${latest.lookbackDays} day lookback`} /> : null}
                {latest ? <ScoreChip score={Math.round(latest.confidence * 100)} label={`${Math.round(latest.confidence * 100)} confidence`} /> : null}
              </Stack>
              <Typography variant="h3">Weekly Market Brief</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Combines your recent job pipeline with sourced market signals to recommend where to focus search effort this week.
              </Typography>
            </Box>
            <ActionButton postTo="/api/market-intelligence/run" variant="contained" color="info" startIcon={<InsightsOutlinedIcon />} loadingLabel="Researching...">
              Run market brief
            </ActionButton>
          </Stack>

          {latest ? (
            <>
              <Alert severity="info">{latest.summary}</Alert>

              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                      <Box>
                        <Typography variant="h4">Research Synthesis</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {latest.researchSynthesis.narrative}
                        </Typography>
                      </Box>
                      <Chip size="small" color={latest.researchSynthesis.mode === "llm" ? "success" : "default"} label={latest.researchSynthesis.mode === "llm" ? "LLM synthesis" : "Deterministic fallback"} />
                    </Stack>
                    {latest.researchSynthesis.warnings.length ? <Alert severity="warning">{latest.researchSynthesis.warnings.join(" ")}</Alert> : null}
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
                      <SynthesisList title="App facts" items={latest.researchSynthesis.appObservedFacts} />
                      <SynthesisList title="Source claims" items={latest.researchSynthesis.sourceBackedClaims} />
                      <SynthesisList title="Weekly moves" items={latest.researchSynthesis.inferredRecommendations} />
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1.25}>
                      <Typography variant="h4">Role Lane Demand</Typography>
                      {latest.chartData.laneDemand.slice(0, 5).map((item) => (
                        <Bar key={item.label} label={item.label} value={item.value} max={Math.max(1, ...latest.chartData.laneDemand.map((row) => row.value))} />
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1.25}>
                      <Typography variant="h4">Skill Signals</Typography>
                      {latest.chartData.skillDemand.slice(0, 8).map((item) => (
                        <Bar key={item.label} label={item.label} value={item.value} max={Math.max(1, ...latest.chartData.skillDemand.map((row) => row.value))} />
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Box>

              {topLane ? (
                <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 900 }}>{topLane.lane}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{topLane.rationale}</Typography>
                    </Box>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                      <Chip size="small" color={temperatureColor(topLane.temperature)} label={topLane.temperature} />
                      <ScoreChip score={topLane.score} label={`${topLane.score} signal`} />
                      {topLane.topCompanies.slice(0, 3).map((company) => <Chip key={company} size="small" variant="outlined" label={company} />)}
                    </Stack>
                  </Stack>
                </Box>
              ) : null}

              {latest.recommendedActions.length ? (
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Recommended actions</Typography>
                  {latest.recommendedActions.map((action) => (
                    <Box key={`${action.category}-${action.title}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                        <Typography sx={{ fontWeight: 850 }}>{action.title}</Typography>
                        <Chip size="small" variant="outlined" label={`P${action.priority}`} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{action.detail}</Typography>
                    </Box>
                  ))}
                </Stack>
              ) : null}

              {topSkills.length ? (
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {topSkills.map((skill) => (
                    <Chip key={skill.skill} label={`${skill.skill}: ${skill.status} (${skill.mentions})`} color={skill.status === "rising" ? "success" : skill.status === "stable" ? "primary" : "default"} />
                  ))}
                </Stack>
              ) : null}

              {latest.researchDigest.length ? (
                <Stack spacing={1}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Fresh research</Typography>
                  {latest.researchDigest.slice(0, 5).map((article) => (
                    <Box key={article.url} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                        <Box>
                          <Link href={article.url} target="_blank" rel="noreferrer" underline="hover" sx={{ fontWeight: 900 }}>
                            {article.title}
                          </Link>
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                            {article.publisher}{article.publishedAt ? ` · ${formatDate(article.publishedAt)}` : ""}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                          <ScoreChip score={article.relevanceScore} label={`${article.relevanceScore} relevance`} />
                          <ScoreChip score={Math.round(article.confidence * 100)} label={`${Math.round(article.confidence * 100)} confidence`} />
                        </Stack>
                      </Stack>
                      {article.claims[0] ? <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{article.claims[0]}</Typography> : null}
                      {article.excerpts[0] ? (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, fontStyle: "italic" }}>
                          {article.excerpts[0]}
                        </Typography>
                      ) : null}
                    </Box>
                  ))}
                </Stack>
              ) : null}

              <Stack spacing={1}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>Sources</Typography>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                  {latest.sourceDigest.map((source) => (
                    <Chip
                      key={source.url}
                      component={Link}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      clickable
                      icon={<OpenInNewIcon />}
                      label={`${source.publisher}: ${source.status}`}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Stack>

              <Typography variant="caption" color="text.secondary">
                Analyzed {latest.dataFreshness.internalJobsAnalyzed} job(s), {latest.dataFreshness.applicationsAnalyzed} application signal(s), {latest.dataFreshness.profilesAnalyzed} profile(s), and {latest.dataFreshness.externalSourcesChecked} checked source(s).
              </Typography>
            </>
          ) : (
            <Alert severity="info">No market brief yet. Run the brief after a search so it can compare external signals against your actual job pipeline.</Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function SynthesisList({ title, items }: { title: string; items: string[] }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, bgcolor: "background.paper" }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 900, textTransform: "uppercase" }}>{title}</Typography>
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {items.slice(0, 4).map((item) => (
          <Typography key={item} variant="caption" color="text.secondary">{item}</Typography>
        ))}
      </Stack>
    </Box>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = `${Math.max(4, Math.round((value / max) * 100))}%`;
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
        <Typography variant="body2" sx={{ fontWeight: 750 }}>{label}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      </Stack>
      <Box sx={{ mt: 0.5, height: 8, borderRadius: 1, bgcolor: "action.hover", overflow: "hidden" }}>
        <Box sx={{ width, height: "100%", bgcolor: "info.main" }} />
      </Box>
    </Box>
  );
}

function temperatureColor(temperature: string) {
  if (temperature === "hot") return "success";
  if (temperature === "warm") return "primary";
  if (temperature === "mixed") return "warning";
  return "default";
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString();
}
