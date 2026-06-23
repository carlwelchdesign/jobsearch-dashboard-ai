"use client";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, type Dispatch } from "react";
import type { ParsedResume } from "@/lib/resumes/schemas";

type ReviewClientProps = {
  upload: {
    id: string;
    fileName: string;
    parsingStatus: string;
    extractedText: string;
    parsedJson: ParsedResume;
  };
};

type SuggestedProfile = {
  name: string;
  searchIntent: string;
  remotePreference: string;
  relocationPreference: string;
  titles: string[];
  jobTypes: string[];
  countries: string[];
  salaryCurrency: string;
  salaryMin: number | null;
  industries: string[];
  keywordsRequired: string[];
  keywordsPreferred: string[];
  keywordsExcluded: string[];
  excludedCompanies: string[];
  minimumMatchScore: number;
  rationale: string;
  evidence: string[];
  githubEvidence: string[];
  alreadyExists?: boolean;
};

type ApprovalResult = {
  activeResumeUploadId: string;
  activationStatus: string;
  candidateReviewRunId: string | null;
  searchProfileRunId: string | null;
  suggestedProfiles: SuggestedProfile[];
  agentReviewErrors: string[];
};

type ReviewState = {
  parsed: ParsedResume;
  editing: boolean;
  notice: string;
  error: string;
  approvalResult: ApprovalResult | null;
  creatingProfile: string;
  approving: boolean;
  redirectingAfterApproval: boolean;
};

type ReviewAction =
  | { type: "requestStarted" }
  | { type: "approveStarted" }
  | { type: "approvalRedirectStarted" }
  | { type: "setError"; error: string }
  | { type: "setEditing"; editing: boolean }
  | { type: "updateContact"; field: keyof ParsedResume["contactInfo"]; value: string }
  | { type: "updateSummary"; value: string }
  | { type: "updateSkillGroup"; field: keyof ParsedResume["skills"]; skills: string[] }
  | { type: "updateWorkExperience"; index: number; patch: Partial<ParsedResume["workExperience"][number]> }
  | { type: "updateExperienceBullet"; index: number; text: string }
  | { type: "updateProject"; index: number; patch: Partial<ParsedResume["projects"][number]> }
  | { type: "updateStringList"; field: "education" | "certifications"; values: string[] }
  | { type: "editsSaved" }
  | { type: "reparsed"; parsed: ParsedResume }
  | { type: "approved"; result: ApprovalResult }
  | { type: "removed" }
  | { type: "setCreatingProfile"; name: string }
  | { type: "profileCreated"; name: string };

type ReviewDispatch = Dispatch<ReviewAction>;

function initialReviewState(parsed: ParsedResume): ReviewState {
  return {
    parsed,
    editing: false,
    notice: "",
    error: "",
    approvalResult: null,
    creatingProfile: "",
    approving: false,
    redirectingAfterApproval: false,
  };
}

function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "requestStarted":
      return { ...state, notice: "", error: "" };
    case "approveStarted":
      return { ...state, approving: true, redirectingAfterApproval: false, notice: "", error: "" };
    case "approvalRedirectStarted":
      return {
        ...state,
        redirectingAfterApproval: true,
        notice: "Approval complete. Taking you to Search Profiles to review the next step.",
      };
    case "setError":
      return { ...state, error: action.error, notice: "", approving: false, redirectingAfterApproval: false };
    case "setEditing":
      return { ...state, editing: action.editing };
    case "updateContact":
      return {
        ...state,
        parsed: {
          ...state.parsed,
          contactInfo: { ...state.parsed.contactInfo, [action.field]: action.value },
        },
      };
    case "updateSummary":
      return { ...state, parsed: { ...state.parsed, professionalSummary: action.value } };
    case "updateSkillGroup":
      return {
        ...state,
        parsed: {
          ...state.parsed,
          skills: { ...state.parsed.skills, [action.field]: action.skills },
        },
      };
    case "updateWorkExperience": {
      const workExperience = [...state.parsed.workExperience];
      if (!workExperience[action.index]) return state;
      workExperience[action.index] = { ...workExperience[action.index], ...action.patch };
      return { ...state, parsed: { ...state.parsed, workExperience } };
    }
    case "updateExperienceBullet": {
      const experienceBullets = [...state.parsed.experienceBullets];
      const bullet = experienceBullets[action.index];
      if (!bullet) return state;
      experienceBullets[action.index] = { ...bullet, text: action.text, truthLevel: "verified" };
      return { ...state, parsed: { ...state.parsed, experienceBullets } };
    }
    case "updateProject": {
      const projects = [...state.parsed.projects];
      if (!projects[action.index]) return state;
      projects[action.index] = { ...projects[action.index], ...action.patch };
      return { ...state, parsed: { ...state.parsed, projects } };
    }
    case "updateStringList":
      return { ...state, parsed: { ...state.parsed, [action.field]: action.values } };
    case "editsSaved":
      return { ...state, editing: false, notice: "Parsed profile edits saved.", error: "" };
    case "reparsed":
      return { ...state, parsed: action.parsed, editing: false, notice: "Resume text re-parsed for review.", error: "" };
    case "approved":
      return {
        ...state,
        approving: false,
        redirectingAfterApproval: false,
        approvalResult: action.result,
        notice: "Approval complete. Candidate profile is active and the agent review finished.",
        error: "",
      };
    case "removed":
      return { ...state, notice: "Resume upload removed from review.", error: "" };
    case "setCreatingProfile":
      return { ...state, creatingProfile: action.name };
    case "profileCreated":
      return {
        ...state,
        creatingProfile: "",
        notice: `Created "${action.name}".`,
        error: "",
        approvalResult: state.approvalResult
          ? {
              ...state.approvalResult,
              suggestedProfiles: state.approvalResult.suggestedProfiles.map((profile) =>
                profile.name === action.name ? { ...profile, alreadyExists: true } : profile,
              ),
            }
          : state.approvalResult,
      };
    default:
      return state;
  }
}

export function ResumeReviewClient({ upload }: ReviewClientProps) {
  const { push, refresh } = useRouter();
  const [state, dispatch] = useReducer(reviewReducer, upload.parsedJson, initialReviewState);
  const { parsed, editing, notice, error, approvalResult, creatingProfile, approving, redirectingAfterApproval } = state;

  useEffect(() => {
    if (!approvalResult) return;

    const redirectTimer = window.setTimeout(() => {
      dispatch({ type: "approvalRedirectStarted" });
      push("/profiles?resumeApproved=1");
    }, 1800);

    return () => window.clearTimeout(redirectTimer);
  }, [approvalResult, push]);

  async function saveEdits() {
    dispatch({ type: "requestStarted" });
    const response = await fetch(`/api/resumes/uploads/${upload.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parsedJson: parsed }),
    });
    const body = await response.json();

    if (!response.ok) {
      dispatch({ type: "setError", error: body.error ?? "Unable to save edits." });
      return;
    }

    dispatch({ type: "editsSaved" });
    refresh();
  }

  async function approve() {
    dispatch({ type: "approveStarted" });
    const response = await fetch(`/api/resumes/uploads/${upload.id}/approve`, { method: "POST" });
    const body = await response.json();

    if (!response.ok) {
      dispatch({ type: "setError", error: body.error ?? "Unable to approve resume upload." });
      return;
    }

    dispatch({ type: "approved", result: body as ApprovalResult });
  }

  async function remove() {
    dispatch({ type: "requestStarted" });
    const response = await fetch(`/api/resumes/uploads/${upload.id}`, { method: "DELETE" });
    const body = await response.json();

    if (!response.ok) {
      dispatch({ type: "setError", error: body.error ?? "Unable to remove upload." });
      return;
    }

    dispatch({ type: "removed" });
    refresh();
  }

  async function reparse() {
    dispatch({ type: "requestStarted" });
    const response = await fetch(`/api/resumes/uploads/${upload.id}/reparse`, { method: "POST" });
    const body = await response.json();

    if (!response.ok) {
      dispatch({ type: "setError", error: body.error ?? "Unable to re-parse resume upload." });
      return;
    }

    dispatch({ type: "reparsed", parsed: body.parsedJson as ParsedResume });
    refresh();
  }

  async function createProfile(suggestion: SuggestedProfile) {
    dispatch({ type: "requestStarted" });
    dispatch({ type: "setCreatingProfile", name: suggestion.name });
    const response = await fetch("/api/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: suggestion.name,
        searchIntent: suggestion.searchIntent,
        remotePreference: suggestion.remotePreference,
        relocationPreference: suggestion.relocationPreference,
        salaryCurrency: suggestion.salaryCurrency,
        salaryMin: suggestion.salaryMin,
        includeUnknownSalary: true,
        minimumMatchScore: suggestion.minimumMatchScore,
        maxResultsPerRun: 50,
        titles: suggestion.titles,
        jobTypes: suggestion.jobTypes,
        countries: suggestion.countries,
        industries: suggestion.industries,
        keywordsRequired: suggestion.keywordsRequired,
        keywordsPreferred: suggestion.keywordsPreferred,
        keywordsExcluded: suggestion.keywordsExcluded,
        excludedCompanies: suggestion.excludedCompanies,
      }),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      dispatch({ type: "setCreatingProfile", name: "" });
      dispatch({ type: "setError", error: body.error ?? "Unable to create suggested profile." });
      return;
    }

    dispatch({ type: "profileCreated", name: suggestion.name });
    refresh();
  }

  return (
    <Stack spacing={3}>
      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Chip color="warning" label={upload.parsingStatus} />
              <Chip variant="outlined" label={upload.fileName} />
              <Chip variant="outlined" label="No fabricated experience" />
            </Stack>
            <Divider />
            <ContactSummarySection parsed={parsed} editing={editing} dispatch={dispatch} />
            <SkillsSection skills={parsed.skills} editing={editing} dispatch={dispatch} />
            <WorkExperienceSection workExperience={parsed.workExperience} editing={editing} dispatch={dispatch} />
            <ExperienceBulletsSection bullets={parsed.experienceBullets} editing={editing} dispatch={dispatch} />
            <ProjectsSection projects={parsed.projects} editing={editing} dispatch={dispatch} />
            <EducationCertificationsSection
              education={parsed.education}
              certifications={parsed.certifications}
              editing={editing}
              dispatch={dispatch}
            />
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {editing ? (
                <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={saveEdits}>Save edits</Button>
              ) : (
                <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => dispatch({ type: "setEditing", editing: true })}>Edit</Button>
              )}
              <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={reparse}>Re-parse upload</Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleOutlineIcon />}
                disabled={approving || redirectingAfterApproval}
                onClick={approve}
              >
                {approving ? "Approving..." : redirectingAfterApproval ? "Opening profiles..." : "Approve candidate profile"}
              </Button>
              <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={remove}>Remove upload</Button>
            </Stack>
            {approvalResult ? (
              <ReonboardingReview
                result={approvalResult}
                creatingProfile={creatingProfile}
                onCreateProfile={(suggestion) => void createProfile(suggestion)}
              />
            ) : null}
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="h3">Extracted text preview</Typography>
          <Typography component="pre" sx={{ mt: 2, whiteSpace: "pre-wrap", fontFamily: "inherit", color: "text.secondary", maxHeight: 320, overflow: "auto" }}>
            {upload.extractedText}
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );

}

function ContactSummarySection({
  parsed,
  editing,
  dispatch,
}: {
  parsed: ParsedResume;
  editing: boolean;
  dispatch: ReviewDispatch;
}) {
  return (
    <>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2 }}>
        <TextField
          label="Full name"
          value={parsed.contactInfo.fullName ?? ""}
          disabled={!editing}
          onChange={(event) => dispatch({ type: "updateContact", field: "fullName", value: event.target.value })}
        />
        <TextField
          label="Email"
          value={parsed.contactInfo.email ?? ""}
          disabled={!editing}
          onChange={(event) => dispatch({ type: "updateContact", field: "email", value: event.target.value })}
        />
        <TextField
          label="Phone"
          value={parsed.contactInfo.phone ?? ""}
          disabled={!editing}
          onChange={(event) => dispatch({ type: "updateContact", field: "phone", value: event.target.value })}
        />
        <TextField
          label="Location"
          value={parsed.contactInfo.location ?? ""}
          disabled={!editing}
          onChange={(event) => dispatch({ type: "updateContact", field: "location", value: event.target.value })}
        />
      </Box>
      <TextField
        label="Professional summary"
        value={parsed.professionalSummary ?? ""}
        multiline
        minRows={3}
        disabled={!editing}
        onChange={(event) => dispatch({ type: "updateSummary", value: event.target.value })}
      />
    </>
  );
}

function SkillsSection({
  skills,
  editing,
  dispatch,
}: {
  skills: ParsedResume["skills"];
  editing: boolean;
  dispatch: ReviewDispatch;
}) {
  function updateSkillGroup(field: keyof ParsedResume["skills"], value: string) {
    dispatch({ type: "updateSkillGroup", field, skills: commaList(value) });
  }

  return (
    <Box>
      <Typography variant="h3">Skills</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 1.5, mt: 1.5 }}>
        <TextField
          label="Core skills"
          value={skills.coreSkills.join(", ")}
          disabled={!editing}
          helperText="Comma-separated"
          onChange={(event) => updateSkillGroup("coreSkills", event.target.value)}
        />
        <TextField
          label="Technical skills"
          value={skills.technicalSkills.join(", ")}
          disabled={!editing}
          helperText="Comma-separated"
          onChange={(event) => updateSkillGroup("technicalSkills", event.target.value)}
        />
        <TextField
          label="Tools, frameworks, libraries"
          value={skills.toolsFrameworksLibraries.join(", ")}
          disabled={!editing}
          helperText="Comma-separated"
          onChange={(event) => updateSkillGroup("toolsFrameworksLibraries", event.target.value)}
        />
        <TextField
          label="Programming languages"
          value={skills.programmingLanguages.join(", ")}
          disabled={!editing}
          helperText="Comma-separated"
          onChange={(event) => updateSkillGroup("programmingLanguages", event.target.value)}
        />
      </Box>
    </Box>
  );
}

function WorkExperienceSection({
  workExperience,
  editing,
  dispatch,
}: {
  workExperience: ParsedResume["workExperience"];
  editing: boolean;
  dispatch: ReviewDispatch;
}) {
  function updateWorkExperience(index: number, patch: Partial<ParsedResume["workExperience"][number]>) {
    dispatch({ type: "updateWorkExperience", index, patch });
  }

  return (
    <Box>
      <Typography variant="h3">Work experience</Typography>
      <Stack spacing={2} sx={{ mt: 1.5 }}>
        {workExperience.map((work, index) => (
          <Box key={`${work.company}-${work.title}-${index}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
            <Stack spacing={1.5}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 1.5 }}>
                <TextField
                  label="Company"
                  value={work.company}
                  disabled={!editing}
                  onChange={(event) => updateWorkExperience(index, { company: event.target.value })}
                />
                <TextField
                  label="Title"
                  value={work.title}
                  disabled={!editing}
                  onChange={(event) => updateWorkExperience(index, { title: event.target.value })}
                />
                <TextField
                  label="Start date"
                  value={work.startDate ?? ""}
                  disabled={!editing}
                  onChange={(event) => updateWorkExperience(index, { startDate: event.target.value })}
                />
                <TextField
                  label="End date"
                  value={work.endDate ?? ""}
                  disabled={!editing}
                  onChange={(event) => updateWorkExperience(index, { endDate: event.target.value })}
                />
              </Box>
              <TextField
                label="Role skills"
                value={work.skills.join(", ")}
                disabled={!editing}
                helperText="These become the fallback Skills line for this role."
                onChange={(event) => updateWorkExperience(index, { skills: commaList(event.target.value) })}
              />
              <TextField
                label="Summary"
                value={work.summary ?? ""}
                multiline
                minRows={2}
                disabled={!editing}
                onChange={(event) => updateWorkExperience(index, { summary: event.target.value })}
              />
              <TextField
                label="Achievements"
                value={work.achievements.join("\n")}
                multiline
                minRows={3}
                disabled={!editing}
                helperText="One bullet per line"
                onChange={(event) => updateWorkExperience(index, { achievements: lineList(event.target.value) })}
              />
            </Stack>
          </Box>
        ))}
        {workExperience.length === 0 ? <Alert severity="warning">No work history was extracted. Add richer resume text or edit the parsed data before approval.</Alert> : null}
      </Stack>
    </Box>
  );
}

function ExperienceBulletsSection({
  bullets,
  editing,
  dispatch,
}: {
  bullets: ParsedResume["experienceBullets"];
  editing: boolean;
  dispatch: ReviewDispatch;
}) {
  return (
    <Box>
      <Typography variant="h3">Experience bullets</Typography>
      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
        {bullets.map((bullet, index) => (
          <TextField
            key={`${bullet.category}-${bullet.sourceText}-${bullet.text}`}
            label={`${bullet.category} · ${bullet.truthLevel}`}
            value={bullet.text}
            multiline
            disabled={!editing}
            onChange={(event) => dispatch({ type: "updateExperienceBullet", index, text: event.target.value })}
          />
        ))}
        {bullets.length === 0 ? <Alert severity="warning">No bullets were extracted. Add richer resume text or edit after upload parsing improves.</Alert> : null}
      </Stack>
    </Box>
  );
}

function ProjectsSection({
  projects,
  editing,
  dispatch,
}: {
  projects: ParsedResume["projects"];
  editing: boolean;
  dispatch: ReviewDispatch;
}) {
  function updateProject(index: number, patch: Partial<ParsedResume["projects"][number]>) {
    dispatch({ type: "updateProject", index, patch });
  }

  return (
    <Box>
      <Typography variant="h3">Projects</Typography>
      <Stack spacing={2} sx={{ mt: 1.5 }}>
        {projects.map((project, index) => (
          <Box key={`${project.name}-${index}`} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
            <Stack spacing={1.5}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 1.5 }}>
                <TextField
                  label="Project name"
                  value={project.name}
                  disabled={!editing}
                  onChange={(event) => updateProject(index, { name: event.target.value })}
                />
                <TextField
                  label="Technologies"
                  value={project.technologies.join(", ")}
                  disabled={!editing}
                  helperText="Comma-separated"
                  onChange={(event) => updateProject(index, { technologies: commaList(event.target.value) })}
                />
                <TextField
                  label="Project URL"
                  value={project.url ?? ""}
                  disabled={!editing}
                  onChange={(event) => updateProject(index, { url: event.target.value })}
                />
                <TextField
                  label="Repo URL"
                  value={project.repoUrl ?? ""}
                  disabled={!editing}
                  onChange={(event) => updateProject(index, { repoUrl: event.target.value })}
                />
              </Box>
              <TextField
                label="Description"
                value={project.description ?? ""}
                multiline
                minRows={2}
                disabled={!editing}
                onChange={(event) => updateProject(index, { description: event.target.value })}
              />
              <TextField
                label="Highlights"
                value={project.highlights.join("\n")}
                multiline
                minRows={3}
                disabled={!editing}
                helperText="One highlight per line"
                onChange={(event) => updateProject(index, { highlights: lineList(event.target.value) })}
              />
            </Stack>
          </Box>
        ))}
        {projects.length === 0 ? <Alert severity="info">No projects were extracted from this upload.</Alert> : null}
      </Stack>
    </Box>
  );
}

function EducationCertificationsSection({
  education,
  certifications,
  editing,
  dispatch,
}: {
  education: string[];
  certifications: string[];
  editing: boolean;
  dispatch: ReviewDispatch;
}) {
  return (
    <Box>
      <Typography variant="h3">Education and certifications</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 1.5, mt: 1.5 }}>
        <TextField
          label="Education"
          value={education.join("\n")}
          multiline
          minRows={3}
          disabled={!editing}
          helperText="One item per line"
          onChange={(event) => dispatch({ type: "updateStringList", field: "education", values: lineList(event.target.value) })}
        />
        <TextField
          label="Certifications"
          value={certifications.join("\n")}
          multiline
          minRows={3}
          disabled={!editing}
          helperText="One item per line"
          onChange={(event) => dispatch({ type: "updateStringList", field: "certifications", values: lineList(event.target.value) })}
        />
      </Box>
    </Box>
  );
}

function ReonboardingReview({
  result,
  creatingProfile,
  onCreateProfile,
}: {
  result: ApprovalResult;
  creatingProfile: string;
  onCreateProfile: (suggestion: SuggestedProfile) => void;
}) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "rgba(37, 99, 235, 0.06)" }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Chip color="success" label="Active resume source" />
          <Chip variant="outlined" label={result.activeResumeUploadId} />
          {result.candidateReviewRunId ? <Chip variant="outlined" label={`Candidate run ${result.candidateReviewRunId}`} /> : null}
          {result.searchProfileRunId ? <Chip variant="outlined" label={`Profile run ${result.searchProfileRunId}`} /> : null}
        </Stack>
        {result.agentReviewErrors.length ? <Alert severity="warning">{result.agentReviewErrors.join(" ")}</Alert> : null}
        <Typography variant="h3">Suggested search profiles</Typography>
        {result.suggestedProfiles.length ? (
          <Stack spacing={1.25}>
            {result.suggestedProfiles.map((suggestion) => (
              <Box key={suggestion.name} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, bgcolor: "background.paper" }}>
                <Stack spacing={1}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "flex-start" } }}>
                    <Box>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                        <Typography sx={{ fontWeight: 900 }}>{suggestion.name}</Typography>
                        <Chip size="small" color="primary" variant="outlined" label={`${suggestion.minimumMatchScore}+`} />
                        {suggestion.alreadyExists ? <Chip size="small" label="Already exists" /> : null}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{suggestion.rationale}</Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      disabled={suggestion.alreadyExists || creatingProfile === suggestion.name}
                      onClick={() => onCreateProfile(suggestion)}
                    >
                      {creatingProfile === suggestion.name ? "Creating..." : "Create profile"}
                    </Button>
                  </Stack>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                    {[...suggestion.titles.slice(0, 4), ...suggestion.keywordsPreferred.slice(0, 8)].map((item) => (
                      <Chip key={`${suggestion.name}-${item}`} size="small" variant="outlined" label={item} />
                    ))}
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        ) : (
          <Alert severity="info">No new search profiles were suggested from this resume review.</Alert>
        )}
      </Stack>
    </Box>
  );
}

function commaList(value: string) {
  return value.split(",").flatMap((item) => {
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}

function lineList(value: string) {
  return value.split(/\r?\n/).flatMap((item) => {
    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });
}
