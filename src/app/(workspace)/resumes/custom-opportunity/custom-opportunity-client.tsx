"use client";

import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

type OpportunityDetails = {
  company: string | null;
  title: string | null;
  location: string | null;
  remoteType: "remote" | "hybrid" | "onsite" | "unknown" | null;
  applicationUrl: string | null;
};

type GenerateResponse = {
  jobUrl: string;
  resumeId: string;
  pdfUrl: string;
  textUrl: string;
  resumePreview: string;
  warnings: string[];
  inferredDetails: OpportunityDetails;
  message?: string;
};

const emptyDetails: OpportunityDetails = {
  company: "",
  title: "",
  location: "",
  remoteType: "unknown",
  applicationUrl: "",
};

type CustomOpportunityState = {
  description: string;
  details: OpportunityDetails;
  result: GenerateResponse | null;
  notice: string;
  error: string;
  inferring: boolean;
  generating: boolean;
  saving: boolean;
  editedResume: string;
};

export function CustomOpportunityClient() {
  const [state, setState] = useState<CustomOpportunityState>({
    description: "",
    details: emptyDetails,
    result: null,
    notice: "",
    error: "",
    inferring: false,
    generating: false,
    saving: false,
    editedResume: "",
  });
  const { description, details, result, notice, error, inferring, generating, saving, editedResume } = state;

  async function inferDetails() {
    setState((current) => ({ ...current, inferring: true, notice: "", error: "", result: null }));

    try {
      const response = await fetch("/api/resumes/custom-opportunity/infer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to extract details.");

      setState((current) => ({
        ...current,
        details: {
          company: payload.details.company ?? current.details.company ?? "",
          title: payload.details.title ?? current.details.title ?? "",
          location: payload.details.location ?? current.details.location ?? "",
          remoteType: payload.details.remoteType ?? current.details.remoteType ?? "unknown",
          applicationUrl: payload.details.applicationUrl ?? current.details.applicationUrl ?? "",
        },
        notice: "Opportunity details extracted.",
      }));
    } catch (caught) {
      setState((current) => ({ ...current, error: caught instanceof Error ? caught.message : "Unable to extract details." }));
    } finally {
      setState((current) => ({ ...current, inferring: false }));
    }
  }

  async function generateResume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState((current) => ({ ...current, generating: true, notice: "", error: "", result: null }));

    try {
      const response = await fetch("/api/resumes/custom-opportunity/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description,
          company: details.company || undefined,
          title: details.title || undefined,
          location: details.location || undefined,
          remoteType: details.remoteType || undefined,
          applicationUrl: details.applicationUrl || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate resume.");

      setState((current) => ({
        ...current,
        result: payload,
        editedResume: payload.resumePreview,
        details: payload.inferredDetails,
        notice: payload.message ?? "Custom opportunity resume generated.",
      }));
    } catch (caught) {
      setState((current) => ({ ...current, error: caught instanceof Error ? caught.message : "Unable to generate resume." }));
    } finally {
      setState((current) => ({ ...current, generating: false }));
    }
  }

  async function saveResumeEdits() {
    if (!result) return;
    setState((current) => ({ ...current, saving: true, notice: "", error: "" }));

    try {
      const response = await fetch(`/api/resumes/generated/${result.resumeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: editedResume }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to save resume.");

      setState((current) => ({
        ...current,
        result: current.result ? { ...current.result, resumePreview: payload.resume?.plainText ?? current.editedResume } : current.result,
        editedResume: payload.resume?.plainText ?? current.editedResume,
        notice: payload.message ?? "Resume saved.",
      }));
    } catch (caught) {
      setState((current) => ({ ...current, error: caught instanceof Error ? caught.message : "Unable to save resume." }));
    } finally {
      setState((current) => ({ ...current, saving: false }));
    }
  }

  return (
    <>
      <Stack spacing={3} sx={{ maxWidth: 1180 }}>
        <PageHeader
          eyebrow="Recruiter intake"
          title="Custom Opportunity Resume"
          description="Paste a recruiter brief, confirm the opportunity fields, and generate a truthful tailored resume from your approved profile evidence."
        />

        <Card>
          <CardContent>
            <Stack component="form" spacing={2.25} onSubmit={generateResume}>
              {notice ? <Alert severity="success">{notice}</Alert> : null}
              {error ? <Alert severity="error">{error}</Alert> : null}
              <TextField
                required
                fullWidth
                multiline
                minRows={10}
                label="Recruiter role brief"
                value={description}
                onChange={(event) => setState((current) => ({ ...current, description: event.target.value }))}
              />
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField fullWidth label="Company" value={details.company ?? ""} onChange={(event) => setDetail("company", event.target.value)} />
                <TextField fullWidth label="Job title" value={details.title ?? ""} onChange={(event) => setDetail("title", event.target.value)} />
              </Stack>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField fullWidth label="Location" value={details.location ?? ""} onChange={(event) => setDetail("location", event.target.value)} />
                <TextField select fullWidth label="Remote type" value={details.remoteType ?? "unknown"} onChange={(event) => setDetail("remoteType", event.target.value)}>
                  <MenuItem value="remote">Remote</MenuItem>
                  <MenuItem value="hybrid">Hybrid</MenuItem>
                  <MenuItem value="onsite">Onsite</MenuItem>
                  <MenuItem value="unknown">Unknown</MenuItem>
                </TextField>
              </Stack>
              <TextField fullWidth label="Application URL" value={details.applicationUrl ?? ""} onChange={(event) => setDetail("applicationUrl", event.target.value)} />
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Button
                  type="button"
                  variant="outlined"
                  startIcon={inferring ? <CircularProgress color="inherit" size={16} thickness={5} /> : <SearchOutlinedIcon />}
                  disabled={inferring || generating}
                  onClick={() => void inferDetails()}
                >
                  {inferring ? "Extracting..." : "Extract details"}
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={generating ? <CircularProgress color="inherit" size={16} thickness={5} /> : <ArticleOutlinedIcon />}
                  disabled={inferring || generating}
                >
                  {generating ? "Generating..." : "Generate resume"}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {result ? (
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                  <Box>
                    <Typography variant="h3">Generated resume</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Resume ID {result.resumeId}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                    <Button
                      type="button"
                      variant="contained"
                      color="success"
                      disabled={saving}
                      startIcon={saving ? <CircularProgress color="inherit" size={16} thickness={5} /> : undefined}
                      onClick={() => void saveResumeEdits()}
                    >
                      {saving ? "Saving..." : "Save edits"}
                    </Button>
                    <Button component={Link} href={result.textUrl} variant="outlined" startIcon={<OpenInNewOutlinedIcon />}>Text</Button>
                    <Button component={Link} href={result.pdfUrl} variant="contained" startIcon={<DownloadOutlinedIcon />}>PDF</Button>
                    <Button component={Link} href={result.jobUrl} variant="outlined">Open job</Button>
                  </Stack>
                </Stack>
                {result.warnings.length ? (
                  <Alert severity="warning">{result.warnings.join(" ")}</Alert>
                ) : null}
                <TextField
                  fullWidth
                  multiline
                  minRows={22}
                  label="Editable resume"
                  value={editedResume}
                  onChange={(event) => setState((current) => ({ ...current, editedResume: event.target.value }))}
                  sx={{
                    "& .MuiInputBase-input": {
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: 13,
                      lineHeight: 1.6,
                    },
                  }}
                />
              </Stack>
            </CardContent>
          </Card>
        ) : null}
      </Stack>
    </>
  );

  function setDetail(key: keyof OpportunityDetails, value: string) {
    setState((current) => ({ ...current, details: { ...current.details, [key]: value } }));
  }
}
