"use client";

import LinkedInIcon from "@mui/icons-material/LinkedIn";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

type PreviewEntry = {
  recommenderName: string;
  recommenderHeadline: string;
  date: string;
  relationship: string;
  body: string;
  sourceRef: string;
  themes: string[];
  duplicate: boolean;
};

export function LinkedInRecommendationImportPanel() {
  const { refresh } = useRouter();
  const [rawText, setRawText] = useState("");
  const [entries, setEntries] = useState<PreviewEntry[]>([]);
  const [createProposedBullets, setCreateProposedBullets] = useState(false);
  const [loading, setLoading] = useState<"preview" | "import" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(mode: "preview" | "import") {
    setLoading(mode);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/evidence/linkedin-recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rawText, mode, createProposedBullets }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to process LinkedIn recommendations.");
      setEntries(Array.isArray(payload.entries) ? payload.entries : []);
      if (mode === "import") {
        const bulletMessage = payload.proposedBulletCount
          ? ` Created ${payload.proposedBulletCount} proposed profile bullet${payload.proposedBulletCount === 1 ? "" : "s"} for review.`
          : "";
        setNotice(`${payload.message ?? "LinkedIn recommendations imported."}${bulletMessage}`);
        refresh();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to process LinkedIn recommendations.");
    } finally {
      setLoading(null);
    }
  }

  const duplicateCount = entries.filter((entry) => entry.duplicate).length;
  const importableCount = entries.length - duplicateCount;

  return (
    <>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
              <Box>
                <Typography variant="h3">Import LinkedIn recommendations</Typography>
                <Typography variant="body2" color="text.secondary">
                  Paste recommendations from LinkedIn. Imports start as review-only evidence and are not used in generated materials until approved.
                </Typography>
              </Box>
              <Button href="/evidence?source=LINKEDIN" variant="outlined" startIcon={<LinkedInIcon />}>
                Review LinkedIn evidence
              </Button>
            </Stack>
            <TextField
              multiline
              minRows={7}
              label="Pasted recommendations"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste recommender name, headline, recommendation date, relationship, and recommendation text."
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
              <FormControlLabel
                control={<Checkbox checked={createProposedBullets} onChange={(event) => setCreateProposedBullets(event.target.checked)} />}
                label="Also create proposed profile bullets for concrete role-backed themes"
              />
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" disabled={loading !== null || rawText.trim().length < 20} onClick={() => void submit("preview")}>
                  {loading === "preview" ? "Previewing..." : "Preview"}
                </Button>
                <Button variant="contained" disabled={loading !== null || rawText.trim().length < 20} onClick={() => void submit("import")}>
                  {loading === "import" ? "Importing..." : "Import"}
                </Button>
              </Stack>
            </Stack>

            <Collapse in={entries.length > 0}>
              <Stack spacing={1.25}>
                <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Chip color="primary" label={`${entries.length} parsed`} />
                  <Chip color={importableCount ? "success" : "default"} variant="outlined" label={`${importableCount} new`} />
                  <Chip color={duplicateCount ? "warning" : "default"} variant="outlined" label={`${duplicateCount} duplicate`} />
                </Stack>
                {entries.map((entry) => (
                  <Box key={entry.sourceRef} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                    <Stack spacing={1}>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                        <Box>
                          <Typography sx={{ fontWeight: 900 }}>{entry.recommenderName}</Typography>
                          <Typography variant="caption" color="text.secondary">{entry.recommenderHeadline}</Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                          <Chip size="small" label={entry.date} />
                          {entry.duplicate ? <Chip size="small" color="warning" variant="outlined" label="duplicate" /> : null}
                        </Stack>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{entry.relationship}</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{entry.body}</Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                        {entry.themes.length ? entry.themes.map((theme) => <Chip key={`${entry.sourceRef}-${theme}`} size="small" variant="outlined" label={theme.replace(/-/g, " ")} />) : <Chip size="small" variant="outlined" label="no theme detected" />}
                      </Stack>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Collapse>
          </Stack>
        </CardContent>
      </Card>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")}>
        <Alert severity="success" variant="filled" onClose={() => setNotice("")}>{notice}</Alert>
      </Snackbar>
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError("")}>
        <Alert severity="error" variant="filled" onClose={() => setError("")}>{error}</Alert>
      </Snackbar>
    </>
  );
}
