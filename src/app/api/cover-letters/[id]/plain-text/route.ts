import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const coverLetter = await prisma.generatedCoverLetter.findUnique({
    where: { id: params.id },
    include: { jobPosting: true, user: true },
  });

  if (!coverLetter) return new Response("Cover letter not found", { status: 404 });

  const text = [
    coverLetter.user.name ?? "Candidate",
    `${coverLetter.jobPosting.company} | ${coverLetter.jobPosting.title}`,
    "",
    coverLetter.body,
  ].join("\n");

  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName(coverLetter.user.name, coverLetter.jobPosting.company, coverLetter.jobPosting.title, "cover-letter", "txt")}"`,
    },
  });
}

function fileName(name: string | null, company: string, title: string, suffix: string, extension: string) {
  return [name ?? "candidate", company, title, suffix]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .concat(`.${extension}`);
}
