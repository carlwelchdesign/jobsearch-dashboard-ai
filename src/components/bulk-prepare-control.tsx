"use client";

import { useRouter } from "next/navigation";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";

type BulkPrepareControlProps = {
  compact?: boolean;
  defaultMinimumScore?: number;
  defaultLimit?: number;
};

type BulkPrepareResponse = {
  error?: string;
  prepared?: number;
  failed?: number;
  eligible?: number;
  nextAvailable?: {
    score: number;
    status: string;
    company: string;
    title: string;
    profile: string;
  } | null;
};

export function BulkPrepareControl({ compact = false, defaultMinimumScore = 85, defaultLimit = 10 }: BulkPrepareControlProps) {
  const router = useRouter();
  const [minimumScore, setMinimumScore] = useState(defaultMinimumScore);
  const [limit, setLimit] = useState(defaultLimit);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info");
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  async function prepareBatch() {
    setLoading(true);
    try {
      const request = fetch("/api/jobs/bulk/prepare-applications", {
        method: "POST",
        headers: { "content-type": "application/json", "x-run-in-background": "1" },
        body: JSON.stringify({
          minimumScore,
          limit,
          statuses: ["needs_review", "approved", "resume_generated", "cover_letter_generated"],
        }),
        keepalive: true,
      });

      setLoading(false);
      setSeverity("info");
      setNotice("Batch preparation started. You can leave this page.");

      request
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({}))) as BulkPrepareResponse;
          if (!response.ok) throw new Error(payload.error ?? "Bulk preparation failed.");
          if (!mounted.current) return;
          const prepared = payload.prepared ?? 0;
          const failed = payload.failed ?? 0;
          if (prepared === 0 && failed === 0) {
            setSeverity("info");
            setNotice(
              payload.nextAvailable
                ? `No jobs met the ${minimumScore}+ threshold. Next eligible match is ${payload.nextAvailable.score}: ${payload.nextAvailable.company} - ${payload.nextAvailable.title}. Lower the min score to prepare it.`
                : "No eligible jobs found. Approve jobs or run a search before auto-preparing.",
            );
            return;
          }
          setSeverity(failed > 0 ? "info" : "success");
          setNotice(`Prepared ${prepared} package(s). ${failed} failed. Review them in Applications.`);
          router.refresh();
        })
        .catch((error) => {
          if (!mounted.current) return;
          setSeverity("error");
          setNotice(error instanceof Error ? error.message : "Bulk preparation failed.");
        });
    } catch (error) {
      setSeverity("error");
      setNotice(error instanceof Error ? error.message : "Bulk preparation failed.");
      setLoading(false);
    }
  }

  const form = (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" } }}>
      <TextField
        select
        size="small"
        label="Min score"
        value={minimumScore}
        onChange={(event) => setMinimumScore(Number(event.target.value))}
        sx={{ minWidth: 128 }}
      >
        {[90, 85, 80, 75, 70].map((score) => <MenuItem key={score} value={score}>{score}+</MenuItem>)}
      </TextField>
      <TextField
        select
        size="small"
        label="Batch"
        value={limit}
        onChange={(event) => setLimit(Number(event.target.value))}
        sx={{ minWidth: 112 }}
      >
        {[5, 10, 15, 25, 50].map((count) => <MenuItem key={count} value={count}>{count}</MenuItem>)}
      </TextField>
      <Button
        variant="contained"
        color="success"
        startIcon={<AutoAwesomeOutlinedIcon />}
        disabled={loading}
        onClick={prepareBatch}
      >
        {loading ? "Preparing..." : "Auto-prepare"}
      </Button>
    </Stack>
  );

  return (
    <>
      {compact ? (
        form
      ) : (
        <Card>
          <CardContent>
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="h3">Auto-prepare top matches</Typography>
                <Typography variant="body2" color="text.secondary">
                  Generate custom resumes and cover letters for the highest scoring jobs. Nothing is submitted automatically.
                </Typography>
              </Box>
              {form}
            </Stack>
          </CardContent>
        </Card>
      )}
      <Snackbar open={Boolean(notice)} autoHideDuration={6000} onClose={() => setNotice("")}>
        <Alert severity={severity} variant="filled" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}
