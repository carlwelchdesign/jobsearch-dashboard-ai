import { LifecycleContextPanel } from "@/components/readiness/readiness-cockpit";
import { prisma } from "@/lib/prisma";
import { buildLifecycleReadiness, type LifecycleReadinessStage } from "@/lib/readiness/lifecycle";

export async function LifecycleReadinessContext({ stages, title }: { stages?: LifecycleReadinessStage[]; title?: string }) {
  const user = await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!user) return null;

  const readiness = await buildLifecycleReadiness({ userId: user.id });
  return <LifecycleContextPanel readiness={readiness} stages={stages} title={title} />;
}
