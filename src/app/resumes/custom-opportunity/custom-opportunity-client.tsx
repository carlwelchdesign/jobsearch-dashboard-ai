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
import { AppShell } from "@/app/app-shell";
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

export function CustomOpportunityClient() {
  const [description, setDescription] = useState("");
  const [details, setDetails] = useState<OpportunityDetails>(emptyDetails);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [inferring, setInferring] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function inferDetails() {
    setInferring(true);
    setNotice("");
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/resumes/custom-opportunity/infer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to extract details.");

      setDetails({
        company: payload.details.company ?? details.company ?? "",
        title: payload.details.title ?? details.title ?? "",
        location: payload.details.location ?? details.location ?? "",
        remoteType: payload.details.remoteType ?? details.remoteType ?? "unknown",
        applicationUrl: payload.details.applicationUrl ?? details.applicationUrl ?? "",
      });
      setNotice("Opportunity details extracted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to extract details.");
    } finally {
      setInferring(false);
    }
  }

  async function generateResume(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenerating(true);
    setNotice("");
    setError("");
    setResult(null);

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

      setResult(payload);
      setDetails(payload.inferredDetails);
      setNotice(payload.message ?? "Custom opportunity resume generated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate resume.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <AppShell>
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
                onChange={(event) => setDescription(event.target.value)}
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
                    <Button component={Link} href={result.textUrl} variant="outlined" startIcon={<OpenInNewOutlinedIcon />}>Text</Button>
                    <Button component={Link} href={result.pdfUrl} variant="contained" startIcon={<DownloadOutlinedIcon />}>PDF</Button>
                    <Button component={Link} href={result.jobUrl} variant="outlined">Open job</Button>
                  </Stack>
                </Stack>
                {result.warnings.length ? (
                  <Alert severity="warning">{result.warnings.join(" ")}</Alert>
                ) : null}
                <Typography
                  component="pre"
                  sx={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    m: 0,
                    p: 2,
                    bgcolor: "rgba(15, 23, 42, 0.04)",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    maxHeight: 620,
                    overflow: "auto",
                  }}
                >
                  {result.resumePreview}
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        ) : null}
      </Stack>
    </AppShell>
  );

  function setDetail(key: keyof OpportunityDetails, value: string) {
    setDetails((current) => ({ ...current, [key]: value }));
  }
}
