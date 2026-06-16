export const metadata = {
  title: "Evidence Library | Job Search OS",
  description: "Review the verified candidate evidence used by agents and generated materials.",
};

import type { CandidateEvidenceSourceType, CandidateEvidenceType, EvidenceConfidence } from "@prisma/client";
import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
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
import { LifecycleReadinessContext } from "@/components/readiness/lifecycle-context";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { jsonArray } from "@/lib/json";
import { prisma } from "@/lib/prisma";
import { BackfillEvidenceButton } from "./backfill-button";
import { AddEvidenceNoteForm } from "./add-evidence-note-form";
import { EmbedEvidenceButton } from "./embed-evidence-button";
import { EvidenceActions } from "./evidence-actions";

export const dynamic = "force-dynamic";

type EvidencePageSearchParams = {
  confidence?: string;
  source?: string;
  type?: string;
};

export default async function EvidencePage({ searchParams }: { searchParams?: EvidencePageSearchParams }) {
  const confidence = normalizeConfidence(searchParams?.confidence);
  const sourceType = normalizeSourceType(searchParams?.source);
  const type = normalizeType(searchParams?.type);
  const [evidence, needsReviewCount, missingEmbeddingCount, usableEvidenceCount] = await Promise.all([
    prisma.candidateEvidence.findMany({
      where: {
        ...(confidence ? { confidence } : {}),
        ...(sourceType ? { sourceType } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        candidateProfile: { select: { fullName: true } },
        embeddings: { select: { model: true, dimensions: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      },
      orderBy: [{ confidence: "asc" }, { updatedAt: "desc" }],
      take: 120,
    }),
    prisma.candidateEvidence.count({ where: { confidence: "NEEDS_REVIEW" } }),
    prisma.candidateEvidence.count({ where: { embeddings: { none: {} }, confidence: { in: ["VERIFIED", "INFERRED"] } } }),
    prisma.candidateEvidence.count({ where: { confidence: { in: ["VERIFIED", "INFERRED"] }, OR: [{ usableInResume: true }, { usableInCoverLetter: true }, { usableInRecruiterMessage: true }] } }),
  ]);
  const nextAction = evidenceNextAction({ needsReviewCount, missingEmbeddingCount, usableEvidenceCount });

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Truth layer"
          title="Evidence Library"
          description="Review the career facts the system is allowed to use. Final resumes, cover letters, and outreach should only use verified or approved inferred evidence."
          actions={
            <>
              <BackfillEvidenceButton />
              <EmbedEvidenceButton />
            </>
          }
        />

        <LifecycleReadinessContext stages={["setup", "trust"]} title="Evidence readiness" />

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
              {nextAction.kind === "embed" ? (
                <EmbedEvidenceButton />
              ) : nextAction.href ? (
                <Button href={nextAction.href} variant="contained" color={nextAction.color} startIcon={nextAction.icon}>
                  {nextAction.label}
                </Button>
              ) : null}
            </Stack>
          </CardContent>
        </Card>

        <AddEvidenceNoteForm />

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
              <TextField select name="source" label="Source" defaultValue={sourceType ?? ""} sx={{ minWidth: 240 }}>
                <MenuItem value="">All sources</MenuItem>
                {["RESUME_UPLOAD", "USER_INPUT", "GITHUB_REPO", "LINKEDIN", "APPLICATION_HISTORY", "INTERVIEW_NOTE", "GENERATED_BUT_APPROVED"].map((item) => (
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
                          {item.embeddings[0] ? <Chip size="small" color="primary" variant="outlined" label={`${item.embeddings[0].dimensions}d embedding`} /> : <Chip size="small" variant="outlined" label="Not embedded" />}
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

function evidenceNextAction({ needsReviewCount, missingEmbeddingCount, usableEvidenceCount }: { needsReviewCount: number; missingEmbeddingCount: number; usableEvidenceCount: number }) {
  if (needsReviewCount > 0) {
    return {
      kind: "link",
      title: "Review uncertain evidence",
      detail: "Approve, edit, or reject uncertain facts before they can influence generated materials.",
      label: "Review evidence",
      href: "/evidence?confidence=NEEDS_REVIEW",
      color: "warning" as const,
      icon: <FactCheckOutlinedIcon />,
      count: needsReviewCount,
    };
  }
  if (missingEmbeddingCount > 0) {
    return {
      kind: "embed",
      title: "Embed approved evidence",
      detail: "Some verified or approved inferred evidence is not searchable by the retrieval layer yet.",
      label: "Embed evidence",
      color: "primary" as const,
      icon: <HubOutlinedIcon />,
      count: missingEmbeddingCount,
    };
  }
  return {
    kind: "link",
    title: usableEvidenceCount > 0 ? "Add fresh career evidence" : "Add your first evidence note",
    detail: usableEvidenceCount > 0
      ? "The truth layer is usable. Add new project notes or interview notes when something changes."
      : "Generation quality depends on approved evidence. Add a project, achievement, or work-history note.",
    label: "Add note below",
    href: "#add-evidence-note",
    color: "primary" as const,
    icon: <AddCircleOutlineOutlinedIcon />,
    count: usableEvidenceCount,
  };
}

function normalizeConfidence(value?: string): EvidenceConfidence | undefined {
  return value === "VERIFIED" || value === "INFERRED" || value === "NEEDS_REVIEW" || value === "REJECTED" ? value : undefined;
}

function normalizeSourceType(value?: string): CandidateEvidenceSourceType | undefined {
  return ["RESUME_UPLOAD", "USER_INPUT", "GITHUB_REPO", "LINKEDIN", "APPLICATION_HISTORY", "INTERVIEW_NOTE", "GENERATED_BUT_APPROVED"].includes(value ?? "") ? value as CandidateEvidenceSourceType : undefined;
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
