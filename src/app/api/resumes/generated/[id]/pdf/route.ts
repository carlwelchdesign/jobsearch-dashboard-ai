import { createSimpleTextPdf } from "@/lib/pdf/simple-resume-pdf";
import { createModernTwoColumnResumePdf } from "@/lib/pdf/modern-resume-pdf";
import { prisma } from "@/lib/prisma";
import { isLegacyResumeFormat, normalizeResumeFormat } from "@/lib/resumes/resume-format";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const resume = await prisma.generatedResume.findUnique({
    where: { id: params.id },
    include: { jobPosting: true, user: { include: { profile: true } } },
  });

  if (!resume) return new Response("Resume not found", { status: 404 });

  const requestedFormat = new URL(request.url).searchParams.get("format");
  const format = normalizeResumeFormat(requestedFormat ?? resume.user.profile?.resumeFormat);
  const resumeText = resume.plainText ?? resume.markdown;
  const pdf = isLegacyResumeFormat(format)
    ? createSimpleTextPdf(resumeText, format)
    : createModernTwoColumnResumePdf(resumeText);

  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fileName(resume.user.name, resume.jobPosting.company, resume.jobPosting.title, "pdf")}"`,
    },
  });
}

function fileName(name: string | null, company: string, title: string, extension: string) {
  return [name ?? "candidate", company, title]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .concat(`.${extension}`);
}
