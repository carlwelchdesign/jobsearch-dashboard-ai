import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const application = await prisma.application.findUnique({
      where: { id: params.id },
      include: {
        coverLetter: true,
        applicationPackets: { orderBy: { updatedAt: "desc" }, take: 1 },
        jobPosting: true,
        resume: true,
        user: { include: { profile: true } },
      },
    });

    if (!application) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    if (application.status !== "ready_to_apply") {
      return NextResponse.json(
        { error: "Application must be ready_to_apply before assisted form filling." },
        { status: 400 },
      );
    }

    if (!application.jobPosting.applicationUrl) {
      return NextResponse.json({ error: "This job does not have an application URL." }, { status: 400 });
    }

    if (!application.resume || !application.coverLetter) {
      return NextResponse.json(
        { error: "A generated resume and cover letter are required before assisted form filling." },
        { status: 400 },
      );
    }

    const origin = new URL(request.url).origin;
    const profile = application.user.profile;
    const fullName = profile?.fullName ?? application.user.name ?? "";
    const [firstName, ...lastNameParts] = fullName.split(/\s+/).filter(Boolean);

    return NextResponse.json({
      safety: {
        localAssistantOnly: true,
        manualSubmitRequired: true,
        prohibitedActions: [
          "Do not submit the application.",
          "Do not bypass CAPTCHA.",
          "Do not use stealth browser settings.",
          "Do not infer sensitive demographic answers. Only use explicit user-configured settings.",
        ],
      },
      application: {
        id: application.id,
        status: application.status,
        notes: application.notes,
        packetId: application.applicationPackets[0]?.id ?? null,
      },
      job: {
        id: application.jobPosting.id,
        company: application.jobPosting.company,
        title: application.jobPosting.title,
        applicationUrl: application.jobPosting.applicationUrl,
      },
      candidate: {
        fullName,
        firstName: firstName ?? "",
        lastName: lastNameParts.join(" "),
        email: profile?.email ?? application.user.email,
        phone: profile?.phone ?? "",
        location: profile?.location ?? "",
        linkedinUrl: profile?.linkedinUrl ?? "",
        githubUrl: profile?.githubUrl ?? "",
        portfolioUrl: profile?.portfolioUrl ?? "",
        demographicAnswers: {
          race: profile?.raceAnswer ?? "",
          gender: profile?.genderAnswer ?? "",
          veteranStatus: profile?.veteranStatusAnswer ?? "",
          disability: profile?.disabilityAnswer ?? "",
        },
      },
      materials: {
        resumeId: application.resume.id,
        resumePdfUrl: `${origin}/api/resumes/generated/${application.resume.id}/pdf`,
        resumePlainTextUrl: `${origin}/api/resumes/generated/${application.resume.id}/plain-text`,
        coverLetterId: application.coverLetter.id,
        coverLetterPdfUrl: `${origin}/api/cover-letters/${application.coverLetter.id}/pdf`,
        coverLetterBody: application.coverLetter.body,
      },
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
