import type { GithubRepository, UserProfile } from "@prisma/client";

export function githubProfileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("github.com")) return url;
    const username = parsed.pathname.split("/").filter(Boolean)[0];
    return username ? `https://github.com/${username}` : null;
  } catch {
    return url;
  }
}

export function linkedinProfileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("linkedin.com")) return url;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0]?.toLowerCase() !== "in" || !parts[1]) return null;
    return `https://www.linkedin.com/in/${parts[1].replace(/\/$/, "")}`;
  } catch {
    return /linkedin\.com\/in\/[^/\s]+/i.test(url) ? url : null;
  }
}

export function githubProfileUrlFromRepositories(
  repositories: Pick<GithubRepository, "htmlUrl" | "fullName">[],
): string | null {
  for (const repo of repositories) {
    const fromUrl = githubProfileUrl(repo.htmlUrl);
    if (fromUrl) return fromUrl;
    const owner = repo.fullName.split("/").filter(Boolean)[0];
    if (owner) return `https://github.com/${owner}`;
  }
  return null;
}

export function buildProfileContactLine(
  userProfile: Pick<UserProfile, "email" | "phone" | "location" | "linkedinUrl" | "githubUrl" | "portfolioUrl">,
  githubRepositories: Pick<GithubRepository, "htmlUrl" | "fullName">[] = [],
) {
  return [
    userProfile.email,
    userProfile.phone,
    userProfile.location,
    linkedinProfileUrl(userProfile.linkedinUrl),
    githubProfileUrl(userProfile.githubUrl) ??
      githubProfileUrlFromRepositories(githubRepositories),
    userProfile.portfolioUrl,
  ]
    .filter((value) => value && value !== "https://")
    .join(" | ");
}
