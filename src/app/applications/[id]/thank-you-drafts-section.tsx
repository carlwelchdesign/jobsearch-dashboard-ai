import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ThankYouDraft } from "@prisma/client";
import { EmptyState } from "@/components/ui/empty-state";
import { jsonArray } from "@/lib/json";
import { thankYouQualityReview } from "@/lib/applications/thank-you-drafts";
import { thankYouStageLabel } from "@/lib/applications/thank-you-draft-constants";
import { CopyDraftButton, ThankYouDraftForm } from "./thank-you-draft-form";

export function ThankYouDraftsSection({ applicationId, drafts }: { applicationId: string; drafts: ThankYouDraft[] }) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <MarkEmailReadOutlinedIcon />
            <Typography variant="h3">Thank-you drafts</Typography>
          </Stack>
          <ThankYouDraftForm applicationId={applicationId} />
          {drafts.length ? (
            <Stack spacing={2}>
              {drafts.map((draft) => (
                <ThankYouDraftItem key={draft.id} draft={draft} />
              ))}
            </Stack>
          ) : (
            <EmptyState title="No thank-you drafts yet" body="Generate a draft after an interview or recruiter conversation. Nothing is sent automatically." />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function ThankYouDraftItem({ draft }: { draft: ThankYouDraft }) {
  const review = thankYouQualityReview(draft.qualityReview);

  return (
    <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
          <Box>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 0.75 }}>
              <Chip size="small" variant="outlined" label={thankYouStageLabel(draft.stage)} />
              <Chip size="small" variant="outlined" label={draft.status} />
              <Chip size="small" variant="outlined" label={review.status ?? "Review"} />
              {draft.interviewDate ? <Chip size="small" variant="outlined" label={draft.interviewDate.toLocaleDateString()} /> : null}
            </Stack>
            <Typography sx={{ fontWeight: 850 }}>{draft.interviewerName}{draft.interviewerTitle ? ` · ${draft.interviewerTitle}` : ""}</Typography>
            <Typography variant="caption" color="text.secondary">Created {draft.createdAt.toLocaleString()}</Typography>
          </Box>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
            <CopyDraftButton label="email" text={`Subject: ${draft.emailSubject}\n\n${draft.emailBody}`} />
            <CopyDraftButton label="LinkedIn" text={draft.linkedinBody} />
          </Stack>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 1.5 }}>
          <DraftTextBlock title="Email" heading={draft.emailSubject} body={draft.emailBody} />
          <DraftTextBlock title="LinkedIn" body={draft.linkedinBody} />
        </Box>
        <SignalSection title="Evidence refs" items={jsonArray(draft.evidenceRefs)} color="primary" />
        <SignalSection title="Review warnings" items={[...(review.warnings ?? []), ...(review.styleViolations ?? [])]} color="warning" />
      </Stack>
    </Box>
  );
}

function DraftTextBlock({ title, heading, body }: { title: string; heading?: string; body: string }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>{title}</Typography>
      {heading ? <Typography sx={{ fontWeight: 850, mt: 0.75 }}>{heading}</Typography> : null}
      <Typography component="pre" variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap", fontFamily: "inherit", m: 0, mt: 1 }}>{body}</Typography>
    </Box>
  );
}

function SignalSection({ title, items, color }: { title: string; items: string[]; color: "primary" | "success" | "warning" }) {
  if (!items.length) return null;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 850, textTransform: "uppercase" }}>{title}</Typography>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
        {items.map((item) => <Chip key={`${title}-${item}`} size="small" color={color} variant="outlined" label={item} />)}
      </Stack>
    </Box>
  );
}
