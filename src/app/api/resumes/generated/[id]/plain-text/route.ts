import { prisma } from "@/lib/prisma";
import {
  cleanResumeSkillsSection,
  resumeSkillJobText,
} from "@/lib/resumes/skill-targeting";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const resume = await prisma.generatedResume.findUnique({
    where: { id: params.id },
    include: { jobPosting: true, user: true },
  });

  if (!resume) return new Response("Resume not found", { status: 404 });

  const resumeText = cleanResumeSkillsSection(resume.plainText ?? resume.markdown, {
    jobText: resumeSkillJobText(resume.jobPosting),
  });

  return new Response(resumeText, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName(resume.user.name, resume.jobPosting.company, resume.jobPosting.title, "txt")}"`,
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
