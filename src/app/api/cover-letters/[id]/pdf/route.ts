import { buildCoverLetterDocumentText } from "@/lib/cover-letters/document";
import { createModernCoverLetterPdf } from "@/lib/pdf/modern-resume-pdf";
import { createSimpleTextPdf } from "@/lib/pdf/simple-resume-pdf";
import { prisma } from "@/lib/prisma";
import { isLegacyResumeFormat, normalizeResumeFormat } from "@/lib/resumes/resume-format";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const coverLetter = await prisma.generatedCoverLetter.findUnique({
    where: { id: params.id },
    include: {
      jobPosting: true,
      user: {
        include: {
          profile: {
            include: {
              githubRepositories: { orderBy: [{ pushedAt: "desc" }, { stars: "desc" }], take: 30 },
            },
          },
        },
      },
    },
  });

  if (!coverLetter) return new Response("Cover letter not found", { status: 404 });

  const requestedFormat = new URL(request.url).searchParams.get("format");
  const format = normalizeResumeFormat(requestedFormat ?? coverLetter.user.profile?.resumeFormat);
  const text = buildCoverLetterDocumentText(coverLetter);
  const pdf = isLegacyResumeFormat(format)
    ? createSimpleTextPdf(text, format)
    : await createModernCoverLetterPdf(text, {
      profileImage: await fetchProfileImage(coverLetter.user.profile?.linkedinPictureUrl),
    });

  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fileName(coverLetter.user.name, coverLetter.jobPosting.company, coverLetter.jobPosting.title, "cover-letter", "pdf")}"`,
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

function fileName(name: string | null, company: string, title: string, suffix: string, extension: string) {
  return [name ?? "candidate", company, title, suffix]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .concat(`.${extension}`);
}
