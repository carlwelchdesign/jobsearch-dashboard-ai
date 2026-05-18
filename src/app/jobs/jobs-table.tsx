"use client";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
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
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { PointerEvent, useMemo, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { JobRejectButton, RejectionReasonDialog, type RejectionReasonCode } from "@/components/job-reject-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreChip } from "@/components/ui/score-chip";
import { StatusChip } from "@/components/ui/status-chip";

export type JobsTableMatch = {
  action: string | null;
  confidenceScore: number | null;
  id: string;
  jobId: string;
  opportunityScore: number | null;
  duplicateGroupId: string | null;
  score: number;
  staleScore: number;
  title: string;
  company: string;
  location: string;
  status: string;
  profileName: string;
  sourceName: string;
  strongestMatches: string[];
};

type StatusView = "active" | "rejected" | "archived" | "all";

export function JobsTable({ matches, statusView, searchQuery = "" }: { matches: JobsTableMatch[]; statusView: StatusView; searchQuery?: string }) {
  const { push, refresh } = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [pendingRejectionFeedback, setPendingRejectionFeedback] = useState<Array<Pick<JobsTableMatch, "id" | "jobId" | "title" | "company">>>([]);
  const filteredMatches = useMemo(() => {
    const dismissed = new Set(dismissedIds);
    return filterByQuery(matches, searchQuery).filter((match) => !dismissed.has(match.id));
  }, [dismissedIds, matches, searchQuery]);
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
    const params = new URLSearchParams();
    if (nextView !== "active") params.set("statusView", nextView);
    if (searchQuery) params.set("q", searchQuery);
    const query = params.toString();
    push(query ? `/jobs?${query}` : "/jobs");
  }

  async function updateSelected(status: "needs_review" | "approved" | "rejected" | "archived") {
    if (selectedIds.length === 0) {
      setSeverity("info");
      setNotice("Select at least one job first.");
      return;
    }

    setLoading(true);
    try {
      const rejectedMatches = status === "rejected"
        ? matches.flatMap((match) => selectedIds.includes(match.id) ? [{ id: match.id, jobId: match.jobId, title: match.title, company: match.company }] : [])
        : [];
      const response = await fetch("/api/jobs/bulk/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchIds: selectedIds, status, source: "jobs_bulk_status" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Batch update failed.");
      setSeverity("success");
      setNotice(payload.message ?? "Batch update complete.");
      if (status === "rejected" && rejectedMatches.length) setPendingRejectionFeedback(rejectedMatches);
      setSelectedIds([]);
      refresh();
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
      if (status === "rejected") setPendingRejectionFeedback([{ id: match.id, jobId: match.jobId, title: match.title, company: match.company }]);
      refresh();
    } catch (error) {
      setDismissedIds((current) => current.filter((id) => id !== match.id));
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to update job.");
    }
  }

  async function submitPendingRejectionFeedback(reasons: RejectionReasonCode[], note: string) {
    await Promise.all(pendingRejectionFeedback.map((match) => fetch("/api/jobs/rejection-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        matchId: match.id,
        jobPostingId: match.jobId,
        reasons,
        note,
        source: pendingRejectionFeedback.length > 1 ? "bulk_rejection_reason_prompt" : "swipe_rejection_reason_prompt",
      }),
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to save rejection feedback.");
      return payload;
    })));
    setPendingRejectionFeedback([]);
    setSeverity("success");
    setNotice("Rejection feedback saved for agent learning.");
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
              {searchQuery ? `Filtered from ${matches.length} jobs.` : "Approve a match to make it eligible for resume and cover letter generation."}
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

        <Stack spacing={1.25} sx={{ display: { xs: "flex", md: "none" }, p: 1.5 }}>
          {filteredMatches.length === 0 ? (
            <EmptyState
              title={searchQuery ? "No jobs match that search" : emptyStateCopy[statusView].title}
              body={searchQuery ? "Try another company, title, location, profile, source, or signal." : emptyStateCopy[statusView].body}
            />
          ) : (
            filteredMatches.map((match) => (
              <SwipeJobCard key={match.id} match={match} onAction={swipeUpdate} />
            ))
          )}
        </Stack>

        <TableContainer sx={{ display: { xs: "none", md: "block" } }}>
          <Table sx={{ minWidth: 1040, tableLayout: "fixed" }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 56, verticalAlign: "middle" }}>Select</TableCell>
                <TableCell sx={{ width: 80 }}>Fit</TableCell>
                <TableCell sx={{ width: 104 }}>Opportunity</TableCell>
                <TableCell>Role</TableCell>
                <TableCell sx={{ width: 128 }}>Status</TableCell>
                <TableCell sx={{ width: 180 }}>Matched profile</TableCell>
                <TableCell sx={{ width: 156 }}>Signals</TableCell>
                <TableCell align="right" sx={{ width: 244 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredMatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <EmptyState
                      title={searchQuery ? "No jobs match that search" : emptyStateCopy[statusView].title}
                      body={searchQuery ? "Try another company, title, location, profile, source, or signal." : emptyStateCopy[statusView].body}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredMatches.map((match) => {
                  const selected = selectedSet.has(match.id);
                  return (
                    <TableRow
                      key={match.id}
                      selected={selected}
                      hover
                      sx={{
                        "& > td": { verticalAlign: "middle" },
                        "&:hover .job-title": { color: "primary.main" },
                      }}
                    >
                      <TableCell padding="checkbox" sx={{ verticalAlign: "middle" }}>
                        <Checkbox
                          checked={selected}
                          onChange={(event) => toggleOne(match.id, event.target.checked)}
                          slotProps={{ input: { "aria-label": `Select ${match.company} ${match.title}` } }}
                          sx={{ p: 0.75 }}
                        />
                      </TableCell>
                      <TableCell>
                        <ScoreChip score={match.score} />
                      </TableCell>
                      <TableCell>
                        {match.opportunityScore === null ? (
                          <Typography variant="caption" color="text.secondary">Not scored</Typography>
                        ) : (
                          <Stack spacing={0.5}>
                            <ScoreChip score={match.opportunityScore} />
                            {match.confidenceScore === null ? null : (
                              <Typography variant="caption" color="text.secondary">Conf {match.confidenceScore}</Typography>
                            )}
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography className="job-title" sx={{ fontWeight: 850 }}>{match.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {match.company} · {match.location}
                        </Typography>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                          {match.duplicateGroupId ? <Chip size="small" color="warning" variant="outlined" label="Duplicate group" /> : null}
                          {match.staleScore >= 45 ? <Chip size="small" color="warning" variant="outlined" label={`Stale ${match.staleScore}`} /> : null}
                        </Stack>
                      </TableCell>
                      <TableCell><StatusChip status={match.status} /></TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{match.profileName}</Typography>
                        <Typography variant="caption" color="text.secondary">{match.sourceName}</Typography>
                      </TableCell>
                      <TableCell sx={{ verticalAlign: "top" }}>
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", maxWidth: 156 }} useFlexGap>
                          {match.strongestMatches.slice(0, 2).map((signal) => (
                            <Chip
                              key={`${match.id}-${signal}`}
                              size="small"
                              variant="outlined"
                              label={signal}
                              sx={{ maxWidth: 132, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
                            />
                          ))}
                          {match.strongestMatches.length > 2 ? (
                            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", fontWeight: 800 }}>
                              +{match.strongestMatches.length - 2}
                            </Typography>
                          ) : null}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end", minWidth: 224 }}>
                          <ActionButton href={`/jobs/${match.jobId}`} size="small" endIcon={<OpenInNewIcon />}>Open</ActionButton>
                          <ActionButton postTo={`/api/jobs/${match.jobId}/approve`} body={{ matchId: match.id }} size="small" color="success">Approve</ActionButton>
                          <JobRejectButton jobId={match.jobId} matchId={match.id} label={`${match.company} - ${match.title}`} />
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
      <RejectionReasonDialog
        open={pendingRejectionFeedback.length > 0}
        title={pendingRejectionFeedback.length === 1
          ? `Why reject ${pendingRejectionFeedback[0].company} - ${pendingRejectionFeedback[0].title}?`
          : `Why reject ${pendingRejectionFeedback.length} selected jobs?`}
        onClose={() => setPendingRejectionFeedback([])}
        onSubmit={submitPendingRejectionFeedback}
      />
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
              {match.opportunityScore === null ? null : <Chip size="small" variant="outlined" label={`Opportunity ${match.opportunityScore}`} />}
              {match.action ? <Chip size="small" color="primary" variant="outlined" label={formatAction(match.action)} /> : null}
              {match.duplicateGroupId ? <Chip size="small" color="warning" variant="outlined" label="Duplicate group" /> : null}
              {match.staleScore >= 45 ? <Chip size="small" color="warning" variant="outlined" label={`Stale ${match.staleScore}`} /> : null}
            </Stack>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase" }}>
                Signals
              </Typography>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
                {match.strongestMatches.slice(0, 5).map((signal) => (
                  <Chip key={`${match.id}-mobile-${signal}`} size="small" variant="outlined" label={signal} />
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
    title: "No job exceptions",
    body: "Run search from the Dashboard. Strong matches will be handled by the agency; uncertain matches will appear here.",
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
    body: "Run search from the Dashboard or add a manual job to start matching.",
  },
};

function filterByQuery(matches: JobsTableMatch[], query: string) {
  const terms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .flatMap((term) => {
      const next = term.trim();
      return next ? [next] : [];
    });
  if (terms.length === 0) return matches;

  return matches.filter((match) => {
    const searchableText = [
      match.company,
      match.title,
      match.location,
      match.profileName,
      match.sourceName,
      match.status,
      match.action ?? "",
      ...match.strongestMatches,
    ].join(" ").toLowerCase();
    return terms.every((term) => searchableText.includes(term));
  });
}

function formatAction(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
