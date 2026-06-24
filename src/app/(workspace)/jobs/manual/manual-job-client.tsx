"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

export function ManualJobClient() {
  const { refresh } = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/jobs/manual", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    setLoading(false);
    if (!response.ok) {
      setError(body.error ?? "Unable to create job.");
      return;
    }

    setNotice(`Saved ${body.job.title}. Created ${body.matches.length} profile match${body.matches.length === 1 ? "" : "es"}.`);
    refresh();
  }

  return (
    <>
      <Stack spacing={3} sx={{ maxWidth: 980 }}>
        <PageHeader
          eyebrow="Manual intake"
          title="Paste Job"
          description="Add a job from a URL or copied description. The app will dedupe, score against enabled profiles, and add qualifying matches to review."
        />
        <Card>
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={submit}>
              {notice ? <Alert severity="success">{notice}</Alert> : null}
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField required fullWidth name="company" label="Company" />
                <TextField required fullWidth name="title" label="Job title" />
              </Stack>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField fullWidth name="location" label="Location" />
                <TextField select fullWidth name="remoteType" label="Remote type" defaultValue="unknown">
                  <MenuItem value="remote">Remote</MenuItem>
                  <MenuItem value="hybrid">Hybrid</MenuItem>
                  <MenuItem value="onsite">Onsite</MenuItem>
                  <MenuItem value="unknown">Unknown</MenuItem>
                </TextField>
              </Stack>
              <TextField fullWidth name="applicationUrl" label="Application URL" />
              <TextField required fullWidth multiline minRows={12} name="description" label="Job description" />
              <Button type="submit" variant="contained" disabled={loading} sx={{ alignSelf: "flex-start" }}>
                {loading ? "Scoring..." : "Save and score"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </>
  );
}
