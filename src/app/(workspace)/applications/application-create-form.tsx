"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Collapse from "@mui/material/Collapse";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ApplicationCreateFormProps = {
  jobs: Array<{
    id: string;
    label: string;
    matchId?: string;
  }>;
};

export function ApplicationCreateForm({ jobs }: ApplicationCreateFormProps) {
  const { refresh } = useRouter();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const selected = jobs.find((job) => job.id === formData.get("jobPostingId"));
    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobPostingId: formData.get("jobPostingId"),
        jobProfileMatchId: selected?.matchId,
        status: formData.get("status"),
        notes: formData.get("notes"),
      }),
    });
    const body = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to create application.");
      return;
    }

    setNotice("Application added.");
    setOpen(false);
    event.currentTarget.reset();
    refresh();
  }

  return (
    <Stack spacing={2}>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen((value) => !value)}>
        {open ? "Close form" : "Add application"}
      </Button>
      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Collapse in={open}>
        <Card>
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={submit}>
              <TextField select required name="jobPostingId" label="Job" defaultValue="" disabled={jobs.length === 0}>
                {jobs.map((job) => <MenuItem key={job.id} value={job.id}>{job.label}</MenuItem>)}
              </TextField>
              <TextField select name="status" label="Status" defaultValue="approved">
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="ready_to_apply">Ready to apply</MenuItem>
                <MenuItem value="applied">Applied</MenuItem>
                <MenuItem value="follow_up_due">Follow up due</MenuItem>
                <MenuItem value="screening">Screening</MenuItem>
                <MenuItem value="interviewing">Interviewing</MenuItem>
                <MenuItem value="offer">Offer</MenuItem>
                <MenuItem value="archived">Archived</MenuItem>
              </TextField>
              <TextField name="notes" label="Notes" multiline minRows={3} />
              <Button type="submit" variant="contained" disabled={saving || jobs.length === 0} sx={{ alignSelf: "flex-start" }}>
                {saving ? "Saving..." : "Save application"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Collapse>
    </Stack>
  );
}
