"use client";

import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";

type RebuildResponse = {
  message?: string;
  error?: string;
  deletedProfiles?: number;
  createdProfiles?: number;
  generatedBy?: string;
  verifiedBulletsConsidered?: number;
  githubRepositoriesConsidered?: number;
  applicationsConsidered?: number;
  profiles?: Array<{
    id: string;
    name: string;
    rationale: string | null;
    titles: string[];
    keywordsPreferred: string[];
    minimumMatchScore: number;
  }>;
};

export function ProfileRebuildPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RebuildResponse | null>(null);
  const confirmed = confirmText === "CLEAR";

  async function rebuild() {
    setRunning(true);
    setError("");
    const response = await fetch("/api/profiles/rebuild", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: "CLEAR_AND_REBUILD" }),
    });
    const body = await response.json().catch(() => ({})) as RebuildResponse;
    setRunning(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to rebuild search profiles.");
      return;
    }

    setResult(body);
    setOpen(false);
    setConfirmText("");
    router.refresh();
  }

  return (
    <Card sx={{ borderColor: "warning.main", bgcolor: "rgba(245, 158, 11, 0.08)" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
            <Box>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1 }}>
                <Chip size="small" color="warning" icon={<WarningAmberOutlinedIcon />} label="Destructive strategy reset" />
              </Stack>
              <Typography variant="h3">Recruiting board rebuild</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Clear every current search profile and let the recruiting-agent board create a replacement strategy from verified resume evidence, GitHub work, applications, outcomes, and email receipts.
              </Typography>
            </Box>
            <Button variant="contained" color="warning" startIcon={<GroupsOutlinedIcon />} disabled={running} onClick={() => setOpen(true)}>
              Rebuild profiles
            </Button>
          </Stack>

          {running ? <LinearProgress /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {result ? (
            <Alert severity="success">
              {result.message} Considered {result.verifiedBulletsConsidered ?? 0} verified bullets, {result.githubRepositoriesConsidered ?? 0} GitHub repos, and {result.applicationsConsidered ?? 0} applications.
            </Alert>
          ) : null}
          {result?.profiles?.length ? (
            <Stack spacing={1}>
              {result.profiles.map((profile) => (
                <Box key={profile.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, bgcolor: "background.paper" }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                      <Typography sx={{ fontWeight: 900 }}>{profile.name}</Typography>
                      <Chip size="small" color="primary" variant="outlined" label={`${profile.minimumMatchScore}+`} />
                    </Stack>
                    {profile.rationale ? <Typography variant="body2" color="text.secondary">{profile.rationale}</Typography> : null}
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                      {[...profile.titles.slice(0, 4), ...profile.keywordsPreferred.slice(0, 6)].map((item, index) => (
                        <Chip key={`${profile.id}-${item}-${index}`} size="small" variant="outlined" label={item} />
                      ))}
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Clear and rebuild profiles?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="warning">
              This deletes all current search profiles. Existing applications and jobs remain, but their profile links may be removed when old match records are deleted.
            </Alert>
            <Typography variant="body2" color="text.secondary">
              Type CLEAR to let the recruiting-agent board replace the profile strategy.
            </Typography>
            <TextField label="Confirmation" value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoFocus />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" color="warning" disabled={!confirmed || running} onClick={() => void rebuild()}>
            {running ? "Rebuilding..." : "Clear and rebuild"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
