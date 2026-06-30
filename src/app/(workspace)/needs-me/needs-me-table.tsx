"use client";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestAnswerForm } from "./request-answer-form";

export type NeedsMeTableRequest = {
  id: string;
  type: string;
  typeLabel: string;
  question: string;
  createdAt: string;
  href: string;
  job: {
    company: string;
    title: string;
  } | null;
  canAnswer: boolean;
  canSaveMemory: boolean;
};

export function NeedsMeTable({ requests }: { requests: NeedsMeTableRequest[] }) {
  const { refresh } = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedAnswerId, setExpandedAnswerId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleRequests = useMemo(() => requests.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [page, requests, rowsPerPage]);
  const allSelected = requests.length > 0 && selectedIds.length === requests.length;
  const partiallySelected = selectedIds.length > 0 && selectedIds.length < requests.length;

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? requests.map((request) => request.id) : []);
  }

  function toggleOne(requestId: string, checked: boolean) {
    setSelectedIds((current) => checked ? Array.from(new Set([...current, requestId])) : current.filter((id) => id !== requestId));
  }

  function changeRowsPerPage(value: string) {
    setRowsPerPage(parseInt(value, 10));
    setPage(0);
  }

  async function dismissSelected() {
    if (selectedIds.length === 0) {
      setSeverity("info");
      setNotice("Select at least one request first.");
      return;
    }

    setLoading(true);
    try {
      const idsToDismiss = [...selectedIds];
      await Promise.all(idsToDismiss.map(async (id) => {
        const response = await fetch(`/api/agent-user-requests/${id}/resolve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "DISMISSED" }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "Unable to dismiss selected requests.");
      }));

      setSelectedIds([]);
      setExpandedAnswerId(null);
      setSeverity("success");
      setNotice(idsToDismiss.length === 1 ? "Request dismissed." : `${idsToDismiss.length} requests dismissed.`);
      refresh();
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Unable to dismiss selected requests.");
    } finally {
      setLoading(false);
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
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            <Checkbox
              checked={allSelected}
              indeterminate={partiallySelected}
              onChange={(event) => toggleAll(event.target.checked)}
              disabled={requests.length === 0 || loading}
              slotProps={{ input: { "aria-label": "Select all open Needs Me requests" } }}
            />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 850 }}>
                {selectedIds.length ? `${selectedIds.length} selected` : `${requests.length} open request${requests.length === 1 ? "" : "s"}`}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Select all covers the full open queue. The table renders one page at a time to keep the browser responsive.
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ justifyContent: { xs: "stretch", md: "flex-end" } }}>
            <Button variant="outlined" disabled={loading || selectedIds.length === 0} onClick={() => setSelectedIds([])}>
              Clear selection
            </Button>
            <Button variant="contained" color="secondary" disabled={loading || selectedIds.length === 0} onClick={() => void dismissSelected()}>
              {loading ? "Dismissing..." : "Dismiss selected"}
            </Button>
          </Stack>
        </Stack>

        <TableContainer>
          <Table sx={{ minWidth: 980, tableLayout: "fixed" }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" sx={{ width: 56 }}>Select</TableCell>
                <TableCell sx={{ width: 168 }}>Type</TableCell>
                <TableCell>Request</TableCell>
                <TableCell sx={{ width: 220 }}>Related role</TableCell>
                <TableCell sx={{ width: 172 }}>Created</TableCell>
                <TableCell align="right" sx={{ width: 268 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <EmptyState title="No open requests" body="When an agent needs a decision, missing answer, or manual intervention, it will appear here." />
                  </TableCell>
                </TableRow>
              ) : (
                visibleRequests.map((request) => {
                  const selected = selectedSet.has(request.id);
                  const answerExpanded = expandedAnswerId === request.id;

                  return (
                    <TableRow key={request.id} selected={selected} hover sx={{ "& > td": { verticalAlign: "top" } }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected}
                          onChange={(event) => toggleOne(request.id, event.target.checked)}
                          disabled={loading}
                          slotProps={{ input: { "aria-label": `Select ${request.typeLabel} request` } }}
                          sx={{ p: 0.75 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={request.type === "APPLICATION_BLOCKED" ? "warning" : "default"}
                          variant={request.type === "APPLICATION_BLOCKED" ? "filled" : "outlined"}
                          label={request.typeLabel}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1.25}>
                          <Typography sx={{ fontWeight: 850, overflowWrap: "anywhere" }}>{request.question}</Typography>
                          {request.canAnswer && answerExpanded ? (
                            <RequestAnswerForm
                              requestId={request.id}
                              question={request.question}
                              canSaveMemory={request.canSaveMemory}
                            />
                          ) : null}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {request.job ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 800, overflowWrap: "anywhere" }}>{request.job.company}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{request.job.title}</Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">No linked role</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{request.createdAt}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.75} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }} useFlexGap>
                          {request.canAnswer ? (
                            <Button size="small" variant="text" onClick={() => setExpandedAnswerId(answerExpanded ? null : request.id)}>
                              {answerExpanded ? "Hide answer" : "Answer"}
                            </Button>
                          ) : null}
                          <ActionButton href={request.href} size="small" variant="outlined" endIcon={<OpenInNewIcon />}>
                            Open context
                          </ActionButton>
                          <ActionButton
                            postTo={`/api/agent-user-requests/${request.id}/resolve`}
                            body={{ status: "RESOLVED" }}
                            size="small"
                            variant="contained"
                          >
                            Mark resolved
                          </ActionButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {requests.length > 0 ? (
          <TablePagination
            component="div"
            count={requests.length}
            page={page}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[10, 25, 50]}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            onRowsPerPageChange={(event) => changeRowsPerPage(event.target.value)}
          />
        ) : null}
      </Card>
      <Snackbar open={Boolean(notice)} autoHideDuration={5000} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
