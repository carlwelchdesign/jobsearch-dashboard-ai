import { createSimpleTextPdf } from "@/lib/pdf/simple-resume-pdf";
import { createModernTwoColumnResumePdf } from "@/lib/pdf/modern-resume-pdf";
import { prisma } from "@/lib/prisma";
import { isLegacyResumeFormat, normalizeResumeFormat } from "@/lib/resumes/resume-format";
import {
  cleanResumeSkillsSection,
  resumeSkillJobText,
} from "@/lib/resumes/skill-targeting";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const resume = await prisma.generatedResume.findUnique({
    where: { id: params.id },
    include: { jobPosting: true, user: { include: { profile: true } } },
  });

  if (!resume) return new Response("Resume not found", { status: 404 });

  const requestedFormat = new URL(request.url).searchParams.get("format");
  const format = normalizeResumeFormat(requestedFormat ?? resume.user.profile?.resumeFormat);
  const skillTargetingContext = {
    jobText: resumeSkillJobText(resume.jobPosting),
  };
  const resumeText = cleanResumeSkillsSection(
    resume.plainText ?? resume.markdown,
    skillTargetingContext,
  );
  const pdf = isLegacyResumeFormat(format)
    ? createSimpleTextPdf(resumeText, format)
    : await createModernTwoColumnResumePdf(resumeText, {
      profileImage: await fetchProfileImage(resume.user.profile?.linkedinPictureUrl),
      skillTargetingContext,
    });

  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fileName(resume.user.name, resume.jobPosting.company, resume.jobPosting.title, "pdf")}"`,
    },
  });
}

async function fetchProfileImage(url: string | null | undefined) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!/^image\/jpe?g$/i.test(mimeType)) return null;
    return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function fileName(name: string | null, company: string, title: string, extension: string) {
  return [name ?? "candidate", company, title]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .concat(`.${extension}`);
}
