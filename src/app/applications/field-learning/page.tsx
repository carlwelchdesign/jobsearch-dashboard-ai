export const metadata = {
  title: "Field Learning | Job Search OS",
  description: "Review application field memories learned by the Apply Sprint assistant.",
};

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Prisma } from "@prisma/client";
import { AppShell } from "@/app/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";
import { FieldMemoryActions } from "./field-memory-actions";

export const dynamic = "force-dynamic";

type FieldMemoryWithSource = Prisma.ApplicationFieldMemoryGetPayload<{
  include: {
    sourceApplication: {
      select: {
        id: true;
        jobPosting: { select: { company: true; title: true } };
      };
    };
  };
}>;

export default async function ApplicationFieldLearningPage() {
  const memories = await prisma.applicationFieldMemory.findMany({
    include: {
      sourceApplication: {
        select: {
          id: true,
          jobPosting: { select: { company: true, title: true } },
        },
      },
    },
    orderBy: [
      { status: "desc" },
      { lastSeenAt: "desc" },
      { confidence: "desc" },
    ],
    take: 250,
  });
  const needsReview = memories.filter((memory) => memory.status === "NEEDS_REVIEW");
  const active = memories.filter((memory) => memory.status === "ACTIVE");
  const disabled = memories.filter((memory) => memory.status === "DISABLED");

  return (
    <AppShell>
      <Stack spacing={3}>
        <PageHeader
          eyebrow="Apply Sprint learning"
          title="Field Learning"
          description="Review what the assistant learned from fields you filled. Low-risk fields can auto-fill; sensitive or custom answers stay here until you approve or disable them."
        />
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
          <MetricCard label="Needs review" value={needsReview.length} tone="warning" />
          <MetricCard label="Auto-fill active" value={active.length} tone="success" />
          <MetricCard label="Disabled" value={disabled.length} tone="default" />
        </Box>
        <MemorySection title="Review Before Auto-Fill" description="These fields were learned, but the system will not auto-use them until you approve them." memories={needsReview} />
        <MemorySection title="Active Auto-Fill Memories" description="These low-risk approved memories are available to the assistant on matching application forms." memories={active} />
        {disabled.length ? <MemorySection title="Disabled Memories" description="These memories will not be reused." memories={disabled} /> : null}
      </Stack>
    </AppShell>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "success" | "warning" | "default" }) {
  return (
    <Card sx={{ borderColor: tone === "success" ? "success.main" : tone === "warning" ? "warning.main" : "divider" }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h1" sx={{ mt: 0.5 }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

function MemorySection({
  title,
  description,
  memories,
}: {
  title: string;
  description: string;
  memories: FieldMemoryWithSource[];
}) {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h3">{title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>
          </Box>
          {memories.length ? (
            <Stack spacing={1.25}>
              {memories.map((memory) => (
                <Box key={memory.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, bgcolor: "background.paper" }}>
                  <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
                    <Chip size="small" color={memory.status === "ACTIVE" ? "success" : memory.status === "NEEDS_REVIEW" ? "warning" : "default"} label={memory.status.toLowerCase().replace(/_/g, " ")} />
                    <Chip size="small" label={memory.category.replace(/_/g, " ")} />
                    <Chip size="small" variant="outlined" label={memory.host} />
                    <Chip size="small" variant="outlined" label={`${memory.confidence}% confidence`} />
                    <Chip size="small" variant="outlined" label={memory.sensitivity.toLowerCase()} />
                    <Chip size="small" variant="outlined" label={memory.reusePolicy.toLowerCase().replace(/_/g, " ")} />
                  </Stack>
                  <Typography sx={{ fontWeight: 850 }}>{memory.label}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: "pre-wrap" }}>{memory.answer}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                    Learned from {memory.sourceApplication?.jobPosting.company ?? "unknown company"} - {memory.sourceApplication?.jobPosting.title ?? "unknown role"} · seen {memory.lastSeenAt.toLocaleString()}
                    {memory.useCount ? ` · used ${memory.useCount} time${memory.useCount === 1 ? "" : "s"}` : ""}
                  </Typography>
                  {memory.status !== "DISABLED" ? (
                    <Box sx={{ mt: 1.25 }}>
                      <FieldMemoryActions memoryId={memory.id} canApprove={memory.status === "NEEDS_REVIEW"} />
                    </Box>
                  ) : null}
                </Box>
              ))}
            </Stack>
          ) : (
            <EmptyState title="Nothing here" body="The assistant has not learned any fields for this section yet." />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
