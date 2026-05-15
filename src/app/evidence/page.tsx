import type { CandidateEvidenceType, EvidenceConfidence } from "@prisma/client";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { AppShell } from "@/app/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { BackfillEvidenceButton } from "./backfill-button";
import { EvidenceActions } from "./evidence-actions";

export const dynamic = "force-dynamic";

type EvidencePageSearchParams = {
  confidence?: string;
  type?: string;
};

export default async function EvidencePage({ searchParams }: { searchParams?: EvidencePageSearchParams }) {
  const confidence = normalizeConfidence(searchParams?.confidence);
  const type = normalizeType(searchParams?.type);
  const evidence = await prisma.candidateEvidence.findMany({
    where: {
      ...(confidence ? { confidence } : {}),
      ...(type ? { type } : {}),
    },
    include: {
      candidateProfile: { select: { fullName: true } },
    },
    orderBy: [{ confidence: "asc" }, { updatedAt: "desc" }],
    take: 120,
  });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Truth layer"
          title="Evidence Library"
          description="Review the career facts the system is allowed to use. Final resumes, cover letters, and outreach should only use verified or approved inferred evidence."
          actions={<BackfillEvidenceButton />}
        />

        <Card>
          <CardContent>
            <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField select name="confidence" label="Confidence" defaultValue={confidence ?? ""} sx={{ minWidth: 220 }}>
                <MenuItem value="">All confidence levels</MenuItem>
                <MenuItem value="VERIFIED">Verified</MenuItem>
                <MenuItem value="INFERRED">Inferred</MenuItem>
                <MenuItem value="NEEDS_REVIEW">Needs review</MenuItem>
                <MenuItem value="REJECTED">Rejected</MenuItem>
              </TextField>
              <TextField select name="type" label="Type" defaultValue={type ?? ""} sx={{ minWidth: 220 }}>
                <MenuItem value="">All types</MenuItem>
                {["EXPERIENCE", "PROJECT", "ACHIEVEMENT", "SKILL", "METRIC", "EDUCATION", "CERTIFICATION", "PREFERENCE", "WRITING_STYLE"].map((item) => (
                  <MenuItem key={item} value={item}>{formatLabel(item)}</MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Button type="submit" variant="contained">
                  Apply filters
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {evidence.length === 0 ? (
          <Card>
            <EmptyState title="No evidence yet" body="Backfill evidence from the approved profile, resume uploads, projects, and GitHub context." />
          </Card>
        ) : (
          <Stack spacing={1.5}>
            {evidence.map((item) => (
              <Card key={item.id}>
                <CardContent>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between" }}>
                      <Box>
                        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                          <Typography variant="h3">{item.title}</Typography>
                          <Chip size="small" label={formatLabel(item.type)} />
                          <Chip size="small" color={confidenceColor(item.confidence)} variant="outlined" label={formatLabel(item.confidence)} />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {formatLabel(item.sourceType)}{item.sourceRef ? ` · ${item.sourceRef}` : ""} · {item.candidateProfile.fullName}
                        </Typography>
                      </Box>
                      <EvidenceActions
                        evidence={{
                          id: item.id,
                          usableInResume: item.usableInResume,
                          usableInCoverLetter: item.usableInCoverLetter,
                          usableInRecruiterMessage: item.usableInRecruiterMessage,
                        }}
                      />
                    </Stack>
                    <Typography sx={{ whiteSpace: "pre-wrap" }}>{item.content}</Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {jsonArray(item.tags).length ? jsonArray(item.tags).map((tag) => <Chip key={`${item.id}-${tag}`} size="small" variant="outlined" label={tag} />) : <Chip size="small" variant="outlined" label="No tags" />}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </AppShell>
  );
}

function normalizeConfidence(value?: string): EvidenceConfidence | undefined {
  return value === "VERIFIED" || value === "INFERRED" || value === "NEEDS_REVIEW" || value === "REJECTED" ? value : undefined;
}

function normalizeType(value?: string): CandidateEvidenceType | undefined {
  return ["EXPERIENCE", "PROJECT", "ACHIEVEMENT", "SKILL", "METRIC", "EDUCATION", "CERTIFICATION", "PREFERENCE", "WRITING_STYLE"].includes(value ?? "") ? value as CandidateEvidenceType : undefined;
}

function formatLabel(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function confidenceColor(confidence: string): "success" | "info" | "warning" | "error" {
  if (confidence === "VERIFIED") return "success";
  if (confidence === "INFERRED") return "info";
  if (confidence === "NEEDS_REVIEW") return "warning";
  return "error";
}
