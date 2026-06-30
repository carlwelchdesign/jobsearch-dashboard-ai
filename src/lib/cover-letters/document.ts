import type { GithubRepository, JobPosting, User, UserProfile } from "@prisma/client";
import { buildProfileContactLine } from "@/lib/resumes/contact-line";

type CoverLetterProfile = Pick<
  UserProfile,
  "fullName" | "email" | "phone" | "location" | "linkedinUrl" | "githubUrl" | "portfolioUrl"
> & {
  githubRepositories?: Pick<GithubRepository, "htmlUrl" | "fullName">[];
};

export type CoverLetterDocumentInput = {
  body: string;
  jobPosting: Pick<JobPosting, "company" | "title">;
  user: Pick<User, "name" | "email"> & {
    profile?: CoverLetterProfile | null;
  };
};

export function buildCoverLetterDocumentText(input: CoverLetterDocumentInput) {
  const profile = input.user.profile;
  const candidateName = profile?.fullName ?? input.user.name ?? "Candidate";
  const contactLine = profile
    ? buildProfileContactLine(profile, profile.githubRepositories ?? [])
    : input.user.email;
  return [
    candidateName,
    contactLine,
    `${input.jobPosting.company} | ${input.jobPosting.title}`,
    "",
    input.body.trim(),
  ]
    .filter((line, index) => index === 3 || Boolean(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
