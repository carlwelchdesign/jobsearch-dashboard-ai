import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AlternateEmailOutlinedIcon from "@mui/icons-material/AlternateEmailOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import { parseResumeDocument } from "@/lib/resumes/resume-document";
import { normalizeResumeFormat, resumeFormatLabel, type ResumeFormat } from "@/lib/resumes/resume-format";

export function ResumePreview({ text, format }: { text: string; format?: string | null }) {
  const selectedFormat = normalizeResumeFormat(format);
  return selectedFormat === "modern_two_column"
    ? <ModernResumePreview text={text} />
    : <ClassicResumePreview text={text} format={selectedFormat} />;
}

function ModernResumePreview({ text }: { text: string }) {
  const document = parseResumeDocument(text);
  const initials = document.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CV";
  return (
    <Box
      sx={{
        bgcolor: "common.white",
        color: "#111827",
        border: 1,
        borderColor: "divider",
        p: { xs: 2, md: 3 },
        maxHeight: 720,
        overflow: "auto",
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 24, lineHeight: 1.05, fontWeight: 950, letterSpacing: 0, textTransform: "uppercase" }}>
              {document.name}
            </Typography>
            <Typography sx={{ color: "#0B84F3", fontWeight: 850, mt: 0.25 }}>{document.headline}</Typography>
            <PreviewContactLine contactLine={document.contactLine} />
          </Box>
          <Box
            aria-hidden
            sx={{
              width: 99,
              height: 99,
              borderRadius: "50%",
              bgcolor: "#0B84F3",
              color: "common.black",
              display: { xs: "none", sm: "grid" },
              placeItems: "center",
              fontWeight: 950,
              fontSize: 31,
              flex: "0 0 auto",
            }}
          >
            {initials}
          </Box>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.45fr 0.95fr" }, gap: 3 }}>
          <Stack spacing={1.4}>
            <PreviewSection title="Experience" />
            {document.experience.map((item) => (
              <Box key={`${item.title}-${item.dates ?? ""}`} sx={{ borderBottom: 1, borderColor: "divider", pb: 1 }}>
                <Typography sx={{ fontWeight: 950, lineHeight: 1.2 }}>{item.role ?? item.title}</Typography>
                {item.company ? <Typography sx={{ color: "#0B84F3", fontWeight: 850, fontSize: 13 }}>{item.company}</Typography> : null}
                {item.dates ? (
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "#4B5563", mt: 0.25 }}>
                    <CalendarMonthOutlinedIcon sx={{ fontSize: 14 }} />
                    <Typography variant="caption" sx={{ color: "inherit" }}>{item.dates}</Typography>
                  </Stack>
                ) : null}
                {item.skills.length ? <Typography variant="caption" sx={{ display: "block", color: "#374151", mt: 0.5, fontStyle: "italic" }}>Skills: {item.skills.join(", ")}</Typography> : null}
                <Stack component="ul" spacing={0.35} sx={{ pl: 2, mt: 0.75, mb: 0 }}>
                  {item.bullets.slice(0, 5).map((bullet) => (
                    <Typography key={bullet} component="li" variant="caption" sx={{ color: "#111827", lineHeight: 1.35 }}>{bullet}</Typography>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
          <Stack spacing={1.5}>
            <PreviewSection title="Summary" />
            {document.summary.map((line) => <Typography key={line} variant="caption" sx={{ color: "#374151", lineHeight: 1.45 }}>{line}</Typography>)}
            {document.education.length ? (
              <>
                <PreviewSection title="Education" />
                {document.education.map((line) => <Typography key={line} variant="caption" sx={{ fontWeight: 800 }}>{line}</Typography>)}
              </>
            ) : null}
            <PreviewSection title="Skills" />
            <Stack direction="row" spacing={0.6} useFlexGap sx={{ flexWrap: "wrap" }}>
              {document.skills.slice(0, 28).map((skill) => (
                <Box
                  key={skill}
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 24,
                    px: 1,
                    borderRadius: 0.75,
                    bgcolor: "#DCEBFF",
                    color: "#035FBF",
                    fontSize: 13,
                    fontWeight: 750,
                    lineHeight: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {skill}
                </Box>
              ))}
            </Stack>
            {document.projects.length ? (
              <>
                <PreviewSection title="Projects" />
                {document.projects.slice(0, 4).map((project) => (
                  <Box key={project.name} sx={{ borderBottom: 1, borderColor: "divider", pb: 1 }}>
                    <Typography sx={{ fontWeight: 900, fontSize: 13 }}>{project.name}</Typography>
                    {project.description ? <Typography variant="caption" sx={{ color: "#374151", lineHeight: 1.35 }}>{project.description}</Typography> : null}
                  </Box>
                ))}
              </>
            ) : null}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}

function PreviewContactLine({ contactLine }: { contactLine: string }) {
  const items = contactItems(contactLine);
  if (!items.length) return null;
  return (
    <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75, color: "#374151" }}>
      {items.map((item) => (
        <Stack key={`${item.kind}-${item.label}`} direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
          {item.kind === "phone" ? <PhoneOutlinedIcon sx={{ fontSize: 14, color: "#0B84F3" }} /> : null}
          {item.kind === "email" ? <AlternateEmailOutlinedIcon sx={{ fontSize: 14, color: "#0B84F3" }} /> : null}
          {item.kind === "link" ? <LinkOutlinedIcon sx={{ fontSize: 14, color: "#0B84F3" }} /> : null}
          <Typography variant="caption" sx={{ color: "inherit", fontWeight: 850, overflowWrap: "anywhere" }}>
            {item.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

type ContactItem = {
  kind: "phone" | "email" | "link";
  label: string;
};

function contactItems(contactLine: string): ContactItem[] {
  return contactLine.split(/\s*\|\s*/).flatMap<ContactItem>((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    const label = trimmed.replace(/^https?:\/\/(?:www\.)?/i, "");
    if (/@/.test(trimmed)) return [{ kind: "email" as const, label }];
    if (/github\.com|linkedin\.com|https?:\/\//i.test(trimmed)) return [{ kind: "link" as const, label }];
    return [{ kind: "phone" as const, label }];
  }).sort((a, b) => contactPriority(a) - contactPriority(b));
}

function contactPriority(item: ContactItem) {
  if (item.kind === "phone") return 0;
  if (item.kind === "email") return 1;
  if (/linkedin\.com/i.test(item.label)) return 2;
  if (/github\.com/i.test(item.label)) return 3;
  return 4;
}

function ClassicResumePreview({ text, format }: { text: string; format: ResumeFormat }) {
  const accent = format === "swiss" ? "#007872" : format === "atelier" ? "#8B6F3D" : "#6B7280";
  return (
    <Box
      sx={{
        bgcolor: format === "atelier" ? "#FDFCF8" : "common.white",
        border: 1,
        borderColor: "divider",
        borderTop: 3,
        borderTopColor: accent,
        p: 2,
        maxHeight: 640,
        overflow: "auto",
      }}
    >
      <Typography variant="caption" sx={{ color: accent, fontWeight: 850 }}>{resumeFormatLabel(format)}</Typography>
      <Typography component="pre" sx={{ whiteSpace: "pre-wrap", fontFamily: "inherit", color: "text.secondary", m: 0, mt: 1 }}>
        {text}
      </Typography>
    </Box>
  );
}

function PreviewSection({ title }: { title: string }) {
  return (
    <Box sx={{ borderBottom: 2, borderColor: "common.black", pb: 0.35, mt: 0.5 }}>
      <Typography sx={{ fontWeight: 950, fontSize: 15, letterSpacing: 0, textTransform: "uppercase", lineHeight: 1 }}>
        {title}
      </Typography>
    </Box>
  );
}
