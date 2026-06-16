"use client";

import AddIcon from "@mui/icons-material/Add";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MergeTypeIcon from "@mui/icons-material/MergeType";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import {
  buildJobEvidenceGroups,
  displayDateRange,
  type JobEvidenceBullet,
  type JobEvidenceGroup,
  type JobEvidenceWorkExperience,
} from "@/lib/resumes/job-evidence";

type ResumeTechItem = {
  name: string;
  version?: string;
  source?: "user_confirmed" | "source_evidence" | "approved_suggestion";
};

type ResumeVersionSuggestion = {
  id: string;
  name: string;
  suggestedVersion: string;
  confidence: number;
  rationale: string;
  status: "NEEDS_REVIEW" | "APPROVED" | "REJECTED";
  source: "source_evidence" | "date_window";
  evidence: string[];
};

type ProfileClientProps = {
  profile: {
    id: string;
    fullName: string;
    email: string;
    professionalSummary: string | null;
  };
  bullets: JobEvidenceBullet[];
  workExperiences: JobEvidenceWorkExperience[];
};

const categories = [
  "frontend",
  "fullstack",
  "testing",
  "security",
  "ai",
  "leadership",
  "visualization",
  "saas",
  "design_systems",
  "devtools",
];

export function ResumeProfileClient({ profile, bullets, workExperiences }: ProfileClientProps) {
  const { refresh } = useRouter();
  const { groups, unmatchedBullets, bulletMatchReviews } = useMemo(() => buildJobEvidenceGroups(workExperiences, bullets), [workExperiences, bullets]);
  const [open, setOpen] = useState(false);
  const [digestGroupId, setDigestGroupId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [bulletQuery, setBulletQuery] = useState("");
  const [techDrafts, setTechDrafts] = useState<Record<string, string[]>>(() => Object.fromEntries(groups.map((group) => [group.id, techToLabels(group.confirmedTech)])));

  const readyJobs = groups.filter((group) => group.readiness.status === "ready").length;
  const incompleteJobs = groups.length - readyJobs;
  const proposedBullets = bullets.filter((bullet) => bullet.truthLevel === "needs_review").length;
  const duplicateGroups = groups.filter((group) => group.readiness.duplicateSources > 0).length;
  const filteredBullets = bullets.filter((bullet) => [bullet.company, bullet.role, bullet.category, bullet.text, bullet.truthLevel].join(" ").toLowerCase().includes(bulletQuery.toLowerCase()));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLoading(true);
    setNotice("");
    setError("");

    const formData = new FormData(form);
    const response = await fetch("/api/resumes/bullets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userProfileId: profile.id,
        company: formData.get("company"),
        role: formData.get("role"),
        category: formData.get("category"),
        text: formData.get("text"),
        keywords: formData.get("keywords"),
        sourceText: formData.get("sourceText"),
        truthLevel: formData.get("truthLevel"),
      }),
    });
    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to add bullet.");
      return;
    }

    setNotice("Verified bullet added to the candidate profile.");
    setOpen(false);
    form.reset();
    refresh();
  }

  async function digestRoleDescription(event: React.FormEvent<HTMLFormElement>, group: JobEvidenceGroup) {
    event.preventDefault();
    const form = event.currentTarget;
    setDigestLoading(true);
    setActionId(`digest:${group.id}`);
    setNotice("");
    setError("");

    const formData = new FormData(form);
    const response = await fetch("/api/resumes/bullets/digest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userProfileId: profile.id,
        company: group.company,
        role: group.title,
        category: formData.get("digestCategory"),
        focusAreas: formData.get("focusAreas"),
        description: formData.get("description"),
      }),
    });
    const body = await response.json();
    setDigestLoading(false);
    setActionId(null);

    if (!response.ok) {
      setError(body.error ?? "Unable to digest role description.");
      return;
    }

    const warningText = Array.isArray(body.warnings) && body.warnings.length ? ` ${body.warnings.join(" ")}` : "";
    setNotice(`${body.message ?? "Proposed bullets created."}${warningText}`);
    setDigestGroupId(null);
    form.reset();
    refresh();
  }

  async function approveBullet(id: string) {
    await patchBullet(id, { truthLevel: "verified" }, "Bullet approved for resume generation.");
  }

  async function rejectBullet(id: string) {
    setActionId(id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/resumes/bullets/${id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to reject bullet.");
      setNotice("Proposed bullet rejected.");
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to reject bullet.");
    } finally {
      setActionId(null);
    }
  }

  async function updateBullet(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await patchBullet(id, {
      company: formData.get("editCompany"),
      role: formData.get("editRole"),
      category: formData.get("editCategory"),
      text: formData.get("editText"),
      keywords: formData.get("editKeywords"),
      sourceText: formData.get("editSourceText"),
    }, "Bullet updated.");
    setEditingId(null);
  }

  async function assignBullet(bullet: JobEvidenceBullet, group: JobEvidenceGroup) {
    await patchBullet(bullet.id, {
      workExperienceId: group.canonicalWorkExperience.id,
      company: group.company,
      role: group.title,
    }, "Bullet assigned to job.");
  }

  async function confirmAllMatches() {
    if (!bulletMatchReviews.length) return;
    setActionId("confirm-matches");
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/resumes/bullets/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matches: bulletMatchReviews }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to confirm bullet matches.");
      setNotice(`Confirmed ${body.updatedCount ?? bulletMatchReviews.length} bullet match${(body.updatedCount ?? bulletMatchReviews.length) === 1 ? "" : "es"}.`);
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to confirm bullet matches.");
    } finally {
      setActionId(null);
    }
  }

  async function patchBullet(id: string, payload: Record<string, FormDataEntryValue | string | null>, successMessage: string) {
    setActionId(id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/resumes/bullets/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to update bullet.");
      setNotice(successMessage);
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update bullet.");
    } finally {
      setActionId(null);
    }
  }

  async function updateRoleContext(event: React.FormEvent<HTMLFormElement>, group: JobEvidenceGroup) {
    event.preventDefault();
    setActionId(`context:${group.id}`);
    setNotice("");
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/resumes/work-experiences/${group.canonicalWorkExperience.id}/resume-context`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicationTitle: formData.get("applicationTitle"),
          applicationSummary: formData.get("applicationSummary"),
          users: formData.get("users"),
          scaleImpact: formData.get("scaleImpact"),
          confirmedTech: parseConfirmedTech((techDrafts[group.id] ?? []).join(", ")),
          versionSuggestions: group.versionSuggestions,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to update role context.");
      setNotice("Job evidence updated.");
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update role context.");
    } finally {
      setActionId(null);
    }
  }

  async function updateSuggestionStatus(group: JobEvidenceGroup, suggestionId: string, status: ResumeVersionSuggestion["status"]) {
    setActionId(`${group.id}:${suggestionId}:${status}`);
    setNotice("");
    setError("");
    try {
      const versionSuggestions = group.versionSuggestions.map((suggestion) => (
        suggestion.id === suggestionId ? { ...suggestion, status } : suggestion
      ));
      const response = await fetch(`/api/resumes/work-experiences/${group.canonicalWorkExperience.id}/resume-context`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...group.mergedContext,
          confirmedTech: group.confirmedTech,
          versionSuggestions,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to update version suggestion.");
      setNotice(status === "APPROVED" ? "Version approved for resume generation." : "Version suggestion rejected.");
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update version suggestion.");
    } finally {
      setActionId(null);
    }
  }

  async function mergeDuplicateSources(group: JobEvidenceGroup) {
    if (group.workExperiences.length < 2) return;
    setActionId(`merge:${group.id}`);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/resumes/work-experiences/merge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          canonicalWorkExperienceId: group.canonicalWorkExperience.id,
          duplicateWorkExperienceIds: duplicateWorkExperienceIds(group),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to merge duplicate sources.");
      setNotice(`Merged ${body.deletedCount ?? group.workExperiences.length - 1} duplicate source${(body.deletedCount ?? 0) === 1 ? "" : "s"}.`);
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to merge duplicate sources.");
    } finally {
      setActionId(null);
    }
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Source of truth"
        title="Job Evidence Library"
        description={`${profile.fullName} · ${profile.email}`}
        actions={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant="outlined" startIcon={<AutoFixHighOutlinedIcon />} onClick={() => setOpen((value) => !value)}>
              {open ? "Close bullet form" : "Add bullet"}
            </Button>
          </Stack>
        }
      />

      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between" }}>
              <Box>
                <Typography variant="h3">Career timeline readiness</Typography>
                <Typography variant="body2" color="text.secondary">
                  Each job owns its resume bullets, confirmed tech, source records, and context.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Chip color={incompleteJobs ? "warning" : "success"} label={`${readyJobs}/${groups.length} jobs ready`} />
                <Chip variant="outlined" color={proposedBullets ? "warning" : "success"} label={`${proposedBullets} bullets to review`} />
                <Chip variant="outlined" color={duplicateGroups ? "warning" : "success"} label={`${duplicateGroups} duplicate groups`} />
              </Stack>
            </Stack>
            {bulletMatchReviews.length ? (
              <Alert
                severity="info"
                action={(
                  <Button color="inherit" size="small" disabled={actionId === "confirm-matches"} onClick={() => void confirmAllMatches()}>
                    {actionId === "confirm-matches" ? "Confirming..." : "Confirm matches"}
                  </Button>
                )}
              >
                {bulletMatchReviews.length} bullet{bulletMatchReviews.length === 1 ? "" : "s"} matched by company and role. Review or confirm the links so future edits stay attached to the right job.
              </Alert>
            ) : null}
            {unmatchedBullets.length ? <Alert severity="warning">{unmatchedBullets.length} bullet{unmatchedBullets.length === 1 ? "" : "s"} need a job assignment.</Alert> : null}
          </Stack>
        </CardContent>
      </Card>

      <Collapse in={open}>
        <Card>
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={submit}>
              <Typography variant="h3">New verified bullet</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2 }}>
                <TextField required name="company" label="Company" />
                <TextField required name="role" label="Role" />
                <TextField select required name="category" label="Category" defaultValue="frontend">
                  {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                </TextField>
                <TextField select required name="truthLevel" label="Truth level" defaultValue="verified">
                  <MenuItem value="verified">verified</MenuItem>
                  <MenuItem value="estimated">estimated</MenuItem>
                  <MenuItem value="needs_review">needs_review</MenuItem>
                </TextField>
              </Box>
              <TextField required multiline minRows={3} name="text" label="Bullet text" />
              <TextField name="keywords" label="Keywords" helperText="Comma-separated, used for matching and tailoring" />
              <TextField multiline minRows={2} name="sourceText" label="Source text / evidence" helperText="Paste the resume/profile evidence supporting this claim." />
              <Button type="submit" variant="contained" disabled={loading} sx={{ alignSelf: "flex-start" }}>
                {loading ? "Saving..." : "Save bullet"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Collapse>

      <Stack spacing={1.5}>
        {groups.map((group) => (
          <Accordion key={group.id} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ width: "100%", alignItems: { md: "center" }, pr: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 900 }}>{group.company} · {group.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{group.displayDates}</Typography>
                </Box>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Chip size="small" icon={group.readiness.status === "ready" ? <CheckCircleIcon /> : <ErrorIcon />} color={group.readiness.status === "ready" ? "success" : "warning"} label={group.readiness.status === "ready" ? "Ready" : "Needs review"} />
                  <Chip size="small" variant="outlined" label={`${group.bullets.length} bullets`} />
                  <Chip size="small" variant="outlined" label={`${group.confirmedTech.length} tech`} />
                  {group.readiness.duplicateSources ? <Chip size="small" color="warning" variant="outlined" label={`${group.workExperiences.length} sources`} /> : null}
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2.5}>
                <ReadinessChips group={group} />
                <Stack component="form" spacing={1.5} onSubmit={(event) => void updateRoleContext(event, group)}>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1.5 }}>
                    <TextField size="small" name="applicationTitle" label="Application / product title" defaultValue={group.mergedContext.applicationTitle ?? ""} />
                    <Autocomplete
                      multiple
                      freeSolo
                      size="small"
                      options={[]}
                      value={techDrafts[group.id] ?? techToLabels(group.confirmedTech)}
                      onChange={(_, value) => setTechDrafts((current) => ({ ...current, [group.id]: value }))}
                      renderInput={(params) => <TextField {...params} label="Confirmed tech" helperText="Add versions only when confirmed." />}
                    />
                    <TextField multiline minRows={2} size="small" name="applicationSummary" label="Application context" defaultValue={group.mergedContext.applicationSummary ?? ""} />
                    <TextField multiline minRows={2} size="small" name="users" label="Users" defaultValue={group.mergedContext.users ?? ""} />
                    <TextField multiline minRows={2} size="small" name="scaleImpact" label="Scale / impact" defaultValue={group.mergedContext.scaleImpact ?? ""} />
                  </Box>
                  <Button type="submit" size="small" variant="contained" disabled={actionId === `context:${group.id}`} sx={{ alignSelf: "flex-start" }}>
                    {actionId === `context:${group.id}` ? "Saving..." : "Save job evidence"}
                  </Button>
                </Stack>

                <BulletTable
                  bullets={group.bullets}
                  groups={groups}
                  editingId={editingId}
                  actionId={actionId}
                  onEdit={setEditingId}
                  onUpdateBullet={updateBullet}
                  onApprove={approveBullet}
                  onReject={rejectBullet}
                  onAssign={assignBullet}
                />

                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Button size="small" variant="outlined" startIcon={<AutoFixHighOutlinedIcon />} onClick={() => setDigestGroupId((current) => current === group.id ? null : group.id)}>
                    {digestGroupId === group.id ? "Close role digest" : "Paste role description"}
                  </Button>
                </Stack>
                <Collapse in={digestGroupId === group.id}>
                  <Stack component="form" spacing={1.5} onSubmit={(event) => void digestRoleDescription(event, group)}>
                    <TextField select name="digestCategory" label="Category override" defaultValue="" size="small">
                      <MenuItem value="">Infer category</MenuItem>
                      {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                    </TextField>
                    <TextField name="focusAreas" label="Focus areas" size="small" helperText="Optional comma-separated themes, tools, or outcomes to prioritize" />
                    <TextField required multiline minRows={5} name="description" label={`Pasted role block for ${group.company}`} />
                    <Button type="submit" size="small" variant="contained" disabled={digestLoading || actionId === `digest:${group.id}`} sx={{ alignSelf: "flex-start" }}>
                      {digestLoading && actionId === `digest:${group.id}` ? "Digesting..." : "Create proposed bullets"}
                    </Button>
                  </Stack>
                </Collapse>

                {group.versionSuggestions.length ? <VersionSuggestions group={group} actionId={actionId} onUpdate={updateSuggestionStatus} /> : null}
                {group.workExperiences.length > 1 ? <DuplicateSources group={group} actionId={actionId} onMerge={mergeDuplicateSources} /> : null}
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Stack>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Typography variant="h3">All bullets</Typography>
                <Typography variant="body2" color="text.secondary">Power-editing view across every job.</Typography>
              </Box>
              <TextField
                size="small"
                value={bulletQuery}
                onChange={(event) => setBulletQuery(event.target.value)}
                label="Search bullets"
                sx={{ width: { xs: "100%", md: 320 } }}
              />
            </Stack>
            <BulletTable
              bullets={filteredBullets}
              groups={groups}
              editingId={editingId}
              actionId={actionId}
              onEdit={setEditingId}
              onUpdateBullet={updateBullet}
              onApprove={approveBullet}
              onReject={rejectBullet}
              onAssign={assignBullet}
            />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function ReadinessChips({ group }: { group: JobEvidenceGroup }) {
  const chips = [
    group.readiness.missingBullets ? "Add verified bullet" : null,
    group.readiness.missingTech ? "Confirm tech" : null,
    group.readiness.missingContext ? "Add context" : null,
    group.readiness.pendingBulletReview ? `${group.readiness.pendingBulletReview} bullet review` : null,
    group.readiness.pendingVersionReview ? `${group.readiness.pendingVersionReview} version review` : null,
    group.readiness.duplicateSources ? "Review duplicate sources" : null,
  ].filter(Boolean);

  if (!chips.length) return <Alert severity="success">This job has enough verified evidence for resume generation.</Alert>;
  return (
    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
      {chips.map((chip) => <Chip key={chip} size="small" color="warning" variant="outlined" label={chip} />)}
    </Stack>
  );
}

function BulletTable({
  bullets,
  groups,
  editingId,
  actionId,
  onEdit,
  onUpdateBullet,
  onApprove,
  onReject,
  onAssign,
}: {
  bullets: JobEvidenceBullet[];
  groups: JobEvidenceGroup[];
  editingId: string | null;
  actionId: string | null;
  onEdit: (id: string | null) => void;
  onUpdateBullet: (event: React.FormEvent<HTMLFormElement>, id: string) => Promise<void>;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onAssign: (bullet: JobEvidenceBullet, group: JobEvidenceGroup) => Promise<void>;
}) {
  if (!bullets.length) return <Alert severity="info">No bullets are attached yet.</Alert>;

  return (
    <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
      <Table size="small" aria-label="Job evidence bullets">
        <TableHead>
          <TableRow>
            <TableCell>Bullet</TableCell>
            <TableCell sx={{ width: 132 }}>Category</TableCell>
            <TableCell sx={{ width: 132 }}>Status</TableCell>
            <TableCell sx={{ width: 230 }}>Job link</TableCell>
            <TableCell align="right" sx={{ width: 210 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {bullets.map((bullet) => (
            <TableRow key={bullet.id} hover>
              <TableCell>
                {editingId === bullet.id ? (
                  <Stack component="form" spacing={1.25} onSubmit={(event) => void onUpdateBullet(event, bullet.id)}>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1 }}>
                      <TextField required size="small" name="editCompany" label="Company" defaultValue={bullet.company} />
                      <TextField required size="small" name="editRole" label="Role" defaultValue={bullet.role} />
                      <TextField select required size="small" name="editCategory" label="Category" defaultValue={bullet.category}>
                        {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                      </TextField>
                    </Box>
                    <TextField required multiline minRows={2} size="small" name="editText" label="Bullet text" defaultValue={bullet.text} />
                    <TextField size="small" name="editKeywords" label="Keywords" defaultValue={bullet.keywords.join(", ")} />
                    <TextField multiline minRows={2} size="small" name="editSourceText" label="Source text" defaultValue={bullet.sourceText ?? ""} />
                    <Stack direction="row" spacing={1}>
                      <Button type="submit" size="small" variant="contained" disabled={actionId === bullet.id}>Save edits</Button>
                      <Button type="button" size="small" variant="outlined" disabled={actionId === bullet.id} onClick={() => onEdit(null)}>Cancel</Button>
                    </Stack>
                  </Stack>
                ) : (
                  <Typography variant="body2">{bullet.text}</Typography>
                )}
              </TableCell>
              <TableCell>{bullet.category}</TableCell>
              <TableCell>
                <Chip size="small" color={bullet.truthLevel === "verified" ? "success" : bullet.truthLevel === "needs_review" ? "warning" : "default"} label={bullet.truthLevel.replace(/_/g, " ")} />
              </TableCell>
              <TableCell>
                <Autocomplete
                  size="small"
                  options={groups}
                  value={groups.find((group) => group.canonicalWorkExperience.id === bullet.workExperienceId) ?? null}
                  getOptionLabel={(group) => `${group.company} · ${group.title}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  onChange={(_, group) => { if (group) void onAssign(bullet, group); }}
                  renderInput={(params) => <TextField {...params} label={bullet.workExperienceId ? "Assigned job" : "Review match"} />}
                />
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.75} sx={{ justifyContent: "flex-end" }}>
                  {bullet.truthLevel === "needs_review" ? (
                    <Button size="small" variant="contained" color="success" disabled={actionId === bullet.id} onClick={() => void onApprove(bullet.id)}>Approve</Button>
                  ) : null}
                  <Button size="small" variant="outlined" disabled={actionId === bullet.id} onClick={() => onEdit(editingId === bullet.id ? null : bullet.id)}>Edit</Button>
                  {bullet.truthLevel === "needs_review" ? (
                    <Button size="small" variant="outlined" color="error" disabled={actionId === bullet.id} onClick={() => void onReject(bullet.id)}>Reject</Button>
                  ) : null}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function VersionSuggestions({ group, actionId, onUpdate }: { group: JobEvidenceGroup; actionId: string | null; onUpdate: (group: JobEvidenceGroup, suggestionId: string, status: ResumeVersionSuggestion["status"]) => Promise<void> }) {
  return (
    <Stack spacing={1}>
      <Typography variant="h3">Version review</Typography>
      {group.versionSuggestions.map((suggestion) => (
        <Box key={suggestion.id} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr auto" }, gap: 1, alignItems: "center" }}>
          <Box>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.5 }}>
              <Chip size="small" color={suggestion.status === "APPROVED" ? "success" : suggestion.status === "REJECTED" ? "default" : "warning"} label={suggestion.status.toLowerCase().replace(/_/g, " ")} />
              <Chip size="small" variant="outlined" label={`${suggestion.name} ${suggestion.suggestedVersion}`} />
              <Chip size="small" variant="outlined" label={`${Math.round(suggestion.confidence * 100)}%`} />
            </Stack>
            <Typography variant="caption" color="text.secondary">{suggestion.rationale}</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {suggestion.status !== "APPROVED" ? <Button size="small" variant="contained" color="success" disabled={Boolean(actionId)} onClick={() => void onUpdate(group, suggestion.id, "APPROVED")}>Approve</Button> : null}
            {suggestion.status !== "REJECTED" ? <Button size="small" variant="outlined" color="error" disabled={Boolean(actionId)} onClick={() => void onUpdate(group, suggestion.id, "REJECTED")}>Reject</Button> : null}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function DuplicateSources({ group, actionId, onMerge }: { group: JobEvidenceGroup; actionId: string | null; onMerge: (group: JobEvidenceGroup) => Promise<void> }) {
  return (
    <Box sx={{ border: 1, borderColor: "warning.main", borderRadius: 1, p: 1.5 }}>
      <Stack spacing={1.25}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
          <Box>
            <Typography variant="h3">Review duplicate sources</Typography>
            <Typography variant="body2" color="text.secondary">These records share company and title. Merge only after confirming they represent the same job.</Typography>
          </Box>
          <Button size="small" variant="contained" color="warning" startIcon={<MergeTypeIcon />} disabled={actionId === `merge:${group.id}`} onClick={() => void onMerge(group)}>
            {actionId === `merge:${group.id}` ? "Merging..." : "Merge duplicates"}
          </Button>
        </Stack>
        <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
          <Table size="small" aria-label="Duplicate source records">
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell>Dates</TableCell>
                <TableCell>Context</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {group.workExperiences.map((work) => (
                <TableRow key={work.id}>
                  <TableCell>{work.sourceResumeUploadId ? `Resume upload ${work.sourceResumeUploadId}` : "Profile update"}</TableCell>
                  <TableCell>{displayDateRange(work)}</TableCell>
                  <TableCell>{work.id === group.canonicalWorkExperience.id ? "Canonical record" : "Duplicate source"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Box>
  );
}

function parseConfirmedTech(value: string): ResumeTechItem[] {
  return value.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.+?)\s+(\d+(?:[.\-x]\w*)?)$/i);
      return {
        name: (match?.[1] ?? item).trim(),
        version: match?.[2]?.trim(),
        source: "user_confirmed" as const,
      };
    });
}

function techToLabels(tech: ResumeTechItem[]) {
  return tech.map((item) => [item.name, item.version].filter(Boolean).join(" "));
}

function duplicateWorkExperienceIds(group: JobEvidenceGroup) {
  const ids: string[] = [];
  for (const work of group.workExperiences) {
    if (work.id !== group.canonicalWorkExperience.id) ids.push(work.id);
  }
  return ids;
}
