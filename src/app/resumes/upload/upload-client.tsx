"use client";

import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/app/app-shell";
import { PageHeader } from "@/components/ui/page-header";

export function ResumeUploadClient() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setStatus("error");
      setMessage("Choose a resume file first.");
      return;
    }

    setStatus("uploading");
    setMessage("");
    const response = await fetch("/api/resumes/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        base64: await fileToBase64(file),
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setStatus("error");
      setMessage(payload.error ?? "Upload failed.");
      return;
    }

    setStatus("done");
    setMessage("Resume parsed and ready for review. Approve it before using this data for tailoring.");
    router.push("/resumes/review");
  }

  return (
    <AppShell>
      <Stack spacing={3} sx={{ maxWidth: 1100 }}>
        <PageHeader
          eyebrow="Resume upload"
          title="Upload Existing Resume"
          description="Supported formats: PDF, DOCX, Markdown, and plain text. PDF extraction warnings should be treated seriously."
        />
        <Card>
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={onSubmit}>
              <Button variant="outlined" component="label" startIcon={<FileUploadOutlinedIcon />} sx={{ alignSelf: "flex-start" }}>
                Choose resume file
                <input
                  hidden
                  required
                  name="file"
                  type="file"
                  accept=".pdf,.docx,.md,.txt,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </Button>
              {file ? <Alert severity="info">Selected: {file.name}</Alert> : null}
              <Button type="submit" variant="contained" disabled={status === "uploading"} sx={{ alignSelf: "flex-start" }}>
                Extract and parse
              </Button>
              {status === "uploading" ? <LinearProgress /> : null}
              {message ? <Alert severity={status === "error" ? "error" : "success"}>{message}</Alert> : null}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </AppShell>
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read selected file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });
}
