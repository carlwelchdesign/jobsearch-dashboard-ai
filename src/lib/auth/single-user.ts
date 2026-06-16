import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SingleUserAuthOptions = {
  allowMultipleUsers?: boolean;
};

export async function requireSingleUser(request?: Request, options: SingleUserAuthOptions = {}): Promise<User> {
  const configuredUserId = process.env.JOB_SEARCH_OS_USER_ID?.trim();
  const configuredEmail = process.env.SEED_USER_EMAIL?.trim();
  const requestedUserId = request?.headers.get("x-job-search-os-user-id")?.trim();

  const user = configuredUserId
    ? await prisma.user.findUnique({ where: { id: configuredUserId } })
    : configuredEmail
      ? await prisma.user.findUnique({ where: { email: configuredEmail } })
      : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    throw new Error(configuredUserId || configuredEmail
      ? "Configured Job Search OS user was not found."
      : "No user exists. Run seed first.");
  }

  if (requestedUserId && requestedUserId !== user.id) {
    throw new Error("Request user does not match the protected Job Search OS user.");
  }

  if (!options.allowMultipleUsers && !configuredUserId && !configuredEmail) {
    const userCount = await prisma.user.count();
    if (userCount > 1) {
      throw new Error("Multiple users exist. Set JOB_SEARCH_OS_USER_ID or SEED_USER_EMAIL before running protected single-user actions.");
    }
  }

  return user;
}
