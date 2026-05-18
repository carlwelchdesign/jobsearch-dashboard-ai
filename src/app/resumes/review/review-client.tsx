"use client";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
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
import { useMemo, useState } from "react";
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

export function ResumeReviewClient({ upload }: ReviewClientProps) {
  const { refresh } = useRouter();
  const [parsed, setParsed] = useState(upload.parsedJson);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const skillsText = useMemo(() => parsed.skills.coreSkills.join(", "), [parsed.skills.coreSkills]);

  async function saveEdits() {
    setError("");
    setNotice("");
    const response = await fetch(`/api/resumes/uploads/${upload.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parsedJson: parsed }),
    });
    const body = await response.json();

    if (!response.ok) {
      setError(body.error ?? "Unable to save edits.");
      return;
    }

    setEditing(false);
    setNotice("Parsed profile edits saved.");
    refresh();
  }

  async function approve() {
    setError("");
    setNotice("");
    const response = await fetch(`/api/resumes/uploads/${upload.id}/approve`, { method: "POST" });
    const body = await response.json();

    if (!response.ok) {
      setError(body.error ?? "Unable to approve resume upload.");
      return;
    }

    setNotice("Candidate profile approved and saved.");
    refresh();
  }

  async function remove() {
    setError("");
    setNotice("");
    const response = await fetch(`/api/resumes/uploads/${upload.id}`, { method: "DELETE" });
    const body = await response.json();

    if (!response.ok) {
      setError(body.error ?? "Unable to remove upload.");
      return;
    }

    setNotice("Resume upload removed from review.");
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
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2 }}>
              <TextField
                label="Full name"
                value={parsed.contactInfo.fullName ?? ""}
                disabled={!editing}
                onChange={(event) => setParsed((previous) => ({ ...previous, contactInfo: { ...previous.contactInfo, fullName: event.target.value } }))}
              />
              <TextField
                label="Email"
                value={parsed.contactInfo.email ?? ""}
                disabled={!editing}
                onChange={(event) => setParsed((previous) => ({ ...previous, contactInfo: { ...previous.contactInfo, email: event.target.value } }))}
              />
              <TextField
                label="Phone"
                value={parsed.contactInfo.phone ?? ""}
                disabled={!editing}
                onChange={(event) => setParsed((previous) => ({ ...previous, contactInfo: { ...previous.contactInfo, phone: event.target.value } }))}
              />
              <TextField
                label="Location"
                value={parsed.contactInfo.location ?? ""}
                disabled={!editing}
                onChange={(event) => setParsed((previous) => ({ ...previous, contactInfo: { ...previous.contactInfo, location: event.target.value } }))}
              />
            </Box>
            <TextField
              label="Professional summary"
              value={parsed.professionalSummary ?? ""}
              multiline
              minRows={3}
              disabled={!editing}
              onChange={(event) => setParsed((previous) => ({ ...previous, professionalSummary: event.target.value }))}
            />
            <TextField
              label="Core skills"
              value={skillsText}
              disabled={!editing}
              helperText="Comma-separated"
              onChange={(event) =>
                setParsed((previous) => ({
                  ...previous,
                  skills: {
                    ...previous.skills,
                    coreSkills: event.target.value.split(",").flatMap((skill) => {
                      const next = skill.trim();
                      return next ? [next] : [];
                    }),
                  },
                }))
              }
            />
            <Box>
              <Typography variant="h3">Experience bullets</Typography>
              <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                {parsed.experienceBullets.map((bullet, index) => (
                  <TextField
                    key={`${bullet.category}-${bullet.sourceText}-${bullet.text}`}
                    label={`${bullet.category} · ${bullet.truthLevel}`}
                    value={bullet.text}
                    multiline
                    disabled={!editing}
                    onChange={(event) => {
                      setParsed((previous) => {
                        const nextBullets = [...previous.experienceBullets];
                        nextBullets[index] = { ...bullet, text: event.target.value, truthLevel: "verified" };
                        return { ...previous, experienceBullets: nextBullets };
                      });
                    }}
                  />
                ))}
                {parsed.experienceBullets.length === 0 ? <Alert severity="warning">No bullets were extracted. Add richer resume text or edit after upload parsing improves.</Alert> : null}
              </Stack>
            </Box>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {editing ? (
                <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={saveEdits}>Save edits</Button>
              ) : (
                <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>Edit</Button>
              )}
              <Button variant="contained" color="success" startIcon={<CheckCircleOutlineIcon />} onClick={approve}>Approve candidate profile</Button>
              <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={remove}>Remove upload</Button>
            </Stack>
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
