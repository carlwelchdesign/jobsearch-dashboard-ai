import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { evaluateAutoSubmitEligibility } from "@/lib/applications/auto-submit-policy";
import { selectedApplicationAnswers } from "@/lib/applications/application-packets";
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
    const packet = application.applicationPackets[0];
    const autoSubmit = await evaluateAutoSubmitEligibility(application.id);

    return NextResponse.json({
      safety: {
        localAssistantOnly: true,
        manualSubmitRequired: !autoSubmit.allowed,
        autoSubmitAllowed: autoSubmit.allowed,
        autoSubmitReasons: autoSubmit.reasons,
        prohibitedActions: [
          autoSubmit.allowed
            ? "Submit only if the page still has no CAPTCHA, login block, unresolved required fields, or unexpected confirmation screen."
            : "Do not submit the application.",
          "Do not bypass CAPTCHA.",
          "Do not use stealth browser settings.",
          "Do not infer sensitive demographic answers. Only use explicit user-configured settings.",
        ],
      },
      application: {
        id: application.id,
        status: application.status,
        notes: application.notes,
        packetId: packet?.id ?? null,
      },
      job: {
        id: application.jobPosting.id,
        company: application.jobPosting.company,
        title: application.jobPosting.title,
        location: application.jobPosting.location,
        country: application.jobPosting.country,
        remoteType: application.jobPosting.remoteType,
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
        selectedApplicationAnswers: selectedApplicationAnswers(packet?.applicationAnswersJson),
      },
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
