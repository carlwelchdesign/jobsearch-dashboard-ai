"use client";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { PointerEvent, useMemo, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreChip } from "@/components/ui/score-chip";
import { StatusChip } from "@/components/ui/status-chip";

export type JobsTableMatch = {
  id: string;
  jobId: string;
  score: number;
  title: string;
  company: string;
  location: string;
  status: string;
  profileName: string;
  sourceName: string;
  strongestMatches: string[];
};

type StatusView = "active" | "rejected" | "archived" | "all";

export function JobsTable({ matches, statusView }: { matches: JobsTableMatch[]; statusView: StatusView }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");
  const [signalQuery, setSignalQuery] = useState("");
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const filteredMatches = useMemo(() => {
    const dismissed = new Set(dismissedIds);
    return filterBySignals(matches, signalQuery).filter((match) => !dismissed.has(match.id));
  }, [dismissedIds, matches, signalQuery]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredSelectedCount = filteredMatches.filter((match) => selectedSet.has(match.id)).length;
  const allSelected = filteredMatches.length > 0 && filteredSelectedCount === filteredMatches.length;
  const partiallySelected = filteredSelectedCount > 0 && filteredSelectedCount < filteredMatches.length;

  function toggleAll(checked: boolean) {
    const filteredIds = new Set(filteredMatches.map((match) => match.id));
    setSelectedIds((current) => {
      if (checked) return Array.from(new Set([...current, ...filteredIds]));
      return current.filter((id) => !filteredIds.has(id));
    });
  }

  function toggleOne(matchId: string, checked: boolean) {
    setSelectedIds((current) => checked ? [...current, matchId] : current.filter((id) => id !== matchId));
  }

  function changeStatusView(nextView: StatusView | null) {
    if (!nextView || nextView === statusView) return;
    setSelectedIds([]);
    router.push(nextView === "active" ? "/jobs" : `/jobs?statusView=${nextView}`);
  }

  async function updateSelected(status: "needs_review" | "approved" | "rejected" | "archived") {
    if (selectedIds.length === 0) {
      setSeverity("info");
      setNotice("Select at least one job first.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/jobs/bulk/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchIds: selectedIds, status }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Batch update failed.");
      setSeverity("success");
      setNotice(payload.message ?? "Batch update complete.");
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Batch update failed.");
    } finally {
      setLoading(false);
    }
  }

  async function swipeUpdate(match: JobsTableMatch, status: "approved" | "rejected") {
    setDismissedIds((current) => [...current, match.id]);
    setSelectedIds((current) => current.filter((id) => id !== match.id));
    setSeverity("success");
    setNotice(status === "approved" ? `Approved ${match.title}.` : `Rejected ${match.title}.`);

    const endpoint = status === "approved" ? `/api/jobs/${match.jobId}/approve` : `/api/jobs/${match.jobId}/reject`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId: match.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to update job.");
      router.refresh();
    } catch (error) {
      setDismissedIds((current) => current.filter((id) => id !== match.id));
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to update job.");
    }
  }

  return (
    <>
      <Card>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          sx={{ p: 1.5, alignItems: { md: "center" }, justifyContent: "space-between", borderBottom: 1, borderColor: "divider" }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Checkbox
              checked={allSelected}
              indeterminate={partiallySelected}
              onChange={(event) => toggleAll(event.target.checked)}
              slotProps={{ input: { "aria-label": "Select all visible jobs" } }}
            />
            <Typography variant="body2" sx={{ fontWeight: 800 }}>
              {selectedIds.length ? `${selectedIds.length} selected` : `${filteredMatches.length} visible jobs`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {signalQuery ? `Filtered from ${matches.length} jobs by signal.` : "Approve a match to make it eligible for resume and cover letter generation."}
            </Typography>
          </Stack>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1} sx={{ alignItems: { lg: "center" } }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={statusView}
              onChange={(_, value) => changeStatusView(value)}
              aria-label="Job status view"
            >
              <ToggleButton value="active">Active</ToggleButton>
              <ToggleButton value="rejected">Rejected</ToggleButton>
              <ToggleButton value="archived">Archived</ToggleButton>
              <ToggleButton value="all">All</ToggleButton>
            </ToggleButtonGroup>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" color="success" disabled={loading || selectedIds.length === 0} onClick={() => void updateSelected("approved")}>
                Approve selected
              </Button>
              {statusView === "archived" ? (
                <Button variant="outlined" disabled={loading || selectedIds.length === 0} onClick={() => void updateSelected("needs_review")}>
                  Move to review
                </Button>
              ) : (
                <Button variant="outlined" disabled={loading || selectedIds.length === 0} onClick={() => void updateSelected("archived")}>
                  Archive selected
                </Button>
              )}
              <Button variant="outlined" color="error" disabled={loading || selectedIds.length === 0} onClick={() => void updateSelected("rejected")}>
                Reject selected
              </Button>
              <Button variant="text" disabled={loading || selectedIds.length === 0} onClick={() => setSelectedIds([])}>
                Deselect all
              </Button>
            </Stack>
          </Stack>
        </Stack>

        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <TextField
            fullWidth
            size="small"
            label="Search signals"
            placeholder="Try react, typescript, security, dashboard, ai, design systems"
            value={signalQuery}
            onChange={(event) => setSignalQuery(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        <Stack spacing={1.25} sx={{ display: { xs: "flex", md: "none" }, p: 1.5 }}>
          {filteredMatches.length === 0 ? (
            <EmptyState
              title={signalQuery ? "No jobs match that signal" : emptyStateCopy[statusView].title}
              body={signalQuery ? "Try another signal such as react, TypeScript, security, dashboard, or AI." : emptyStateCopy[statusView].body}
            />
          ) : (
            filteredMatches.map((match) => (
              <SwipeJobCard key={match.id} match={match} onAction={swipeUpdate} />
            ))
          )}
        </Stack>

        <TableContainer sx={{ display: { xs: "none", md: "block" } }}>
          <Table sx={{ minWidth: 1040 }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">Select</TableCell>
                <TableCell>Score</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Matched profile</TableCell>
                <TableCell>Signals</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredMatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState
                      title={signalQuery ? "No jobs match that signal" : emptyStateCopy[statusView].title}
                      body={signalQuery ? "Try another signal such as react, TypeScript, security, dashboard, or AI." : emptyStateCopy[statusView].body}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredMatches.map((match) => {
                  const selected = selectedSet.has(match.id);
                  return (
                    <TableRow key={match.id} selected={selected} hover sx={{ "&:hover .job-title": { color: "primary.main" } }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected}
                          onChange={(event) => toggleOne(match.id, event.target.checked)}
                          slotProps={{ input: { "aria-label": `Select ${match.company} ${match.title}` } }}
                        />
                      </TableCell>
                      <TableCell>
                        <ScoreChip score={match.score} />
                      </TableCell>
                      <TableCell>
                        <Typography className="job-title" sx={{ fontWeight: 850 }}>{match.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {match.company} · {match.location}
                        </Typography>
                      </TableCell>
                      <TableCell><StatusChip status={match.status} /></TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{match.profileName}</Typography>
                        <Typography variant="caption" color="text.secondary">{match.sourceName}</Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }} useFlexGap>
                          {match.strongestMatches.slice(0, 3).map((signal, index) => (
                            <Chip key={`${match.id}-${signal}-${index}`} size="small" variant="outlined" label={signal} />
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end", minWidth: 224 }}>
                          <ActionButton href={`/jobs/${match.jobId}`} size="small" endIcon={<OpenInNewIcon />}>Open</ActionButton>
                          <ActionButton postTo={`/api/jobs/${match.jobId}/approve`} body={{ matchId: match.id }} size="small" color="success">Approve</ActionButton>
                          <ActionButton postTo={`/api/jobs/${match.jobId}/reject`} body={{ matchId: match.id }} size="small" color="error">Reject</ActionButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}

function SwipeJobCard({ match, onAction }: { match: JobsTableMatch; onAction: (match: JobsTableMatch, status: "approved" | "rejected") => void }) {
  const [startX, setStartX] = useState<number | null>(null);
  const [deltaX, setDeltaX] = useState(0);
  const threshold = 88;
  const action = deltaX > 36 ? "Approve" : deltaX < -36 ? "Reject" : "";
  const actionColor = deltaX > 36 ? "success.main" : deltaX < -36 ? "error.main" : "transparent";

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    setStartX(event.clientX);
    setDeltaX(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (startX === null) return;
    setDeltaX(Math.max(-140, Math.min(140, event.clientX - startX)));
  }

  function pointerUp() {
    if (deltaX >= threshold) {
      onAction(match, "approved");
    } else if (deltaX <= -threshold) {
      onAction(match, "rejected");
    }
    setStartX(null);
    setDeltaX(0);
  }

  return (
    <Box sx={{ position: "relative", overflow: "hidden", borderRadius: 2 }}>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: deltaX >= 0 ? "flex-start" : "flex-end",
          px: 2,
          bgcolor: actionColor,
          color: "#fff",
          fontWeight: 900,
          transition: startX === null ? "background-color 160ms ease" : "none",
        }}
      >
        {action}
      </Box>
      <Card
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        sx={{
          touchAction: "pan-y",
          transform: `translateX(${deltaX}px) rotate(${deltaX / 28}deg)`,
          transition: startX === null ? "transform 160ms ease" : "none",
          position: "relative",
          zIndex: 1,
        }}
      >
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h3" sx={{ overflowWrap: "anywhere" }}>{match.title}</Typography>
                <Typography variant="body2" color="text.secondary">{match.company} · {match.location}</Typography>
              </Box>
              <ScoreChip score={match.score} />
            </Stack>

            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
              <StatusChip status={match.status} />
              <Chip size="small" variant="outlined" label={match.profileName} />
            </Stack>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase" }}>
                Signals
              </Typography>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                {match.strongestMatches.slice(0, 5).map((signal, index) => (
                  <Chip key={`${match.id}-mobile-${signal}-${index}`} size="small" variant="outlined" label={signal} />
                ))}
              </Stack>
            </Box>

            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="caption" color="text.secondary">Swipe right to approve. Swipe left to reject.</Typography>
              <ActionButton href={`/jobs/${match.jobId}`} size="small" endIcon={<OpenInNewIcon />}>Open</ActionButton>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

const emptyStateCopy: Record<StatusView, { title: string; body: string }> = {
  active: {
    title: "No active jobs",
    body: "Add a manual job or run a search to populate the review queue.",
  },
  rejected: {
    title: "No rejected jobs",
    body: "Rejected jobs will appear here after you filter out poor matches.",
  },
  archived: {
    title: "No archived jobs",
    body: "Archived jobs will appear here when you remove older or inactive matches from the active queue.",
  },
  all: {
    title: "No matched jobs yet",
    body: "Add a manual job or run a search to populate the review queue.",
  },
};

function filterBySignals(matches: JobsTableMatch[], query: string) {
  const terms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return matches;

  return matches.filter((match) => {
    const signalText = match.strongestMatches.join(" ").toLowerCase();
    return terms.every((term) => signalText.includes(term));
  });
}
