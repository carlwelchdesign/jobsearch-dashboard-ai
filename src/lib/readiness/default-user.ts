import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { buildLifecycleReadiness } from "@/lib/readiness/lifecycle";

export const getLifecycleReadinessForDefaultUser = cache(async () => {
  const user = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!user) return null;

  return {
    userId: user.id,
    readiness: await buildLifecycleReadiness({ userId: user.id }),
  };
});
