export const metadata = {
  title: "Review Resume | Job Search OS",
  description: "Review parsed resume evidence before approving it for generated materials.",
};

import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import { AppShell } from "@/app/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";
import { parseUploadedResumeSchema } from "@/lib/resumes/schemas";
import { ResumeReviewClient } from "./review-client";

export const dynamic = "force-dynamic";

export default async function ResumeReviewPage() {
  const upload = await prisma.resumeUpload.findFirst({
    where: { parsingStatus: "needs_review" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <Stack spacing={3} sx={{ maxWidth: 1100 }}>
        <PageHeader
          eyebrow="Human approval checkpoint"
          title="Review Parsed Profile"
          description="Parsed resume data is not used for tailoring until the user approves it."
        />
        {!upload ? (
          <Alert severity="info">No resume uploads need review. Upload a resume to create a parsed candidate profile.</Alert>
        ) : (
          <ResumeReviewClient
            upload={{
              id: upload.id,
              fileName: upload.fileName,
              parsingStatus: upload.parsingStatus,
              extractedText: upload.extractedText,
              parsedJson: parseUploadedResumeSchema.parse(upload.parsedJson),
            }}
          />
        )}
      </Stack>
    </AppShell>
  );
}
