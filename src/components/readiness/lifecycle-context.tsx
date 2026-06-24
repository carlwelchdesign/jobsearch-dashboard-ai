import { LifecycleContextPanel } from "@/components/readiness/readiness-cockpit";
import { getLifecycleReadinessForDefaultUser } from "@/lib/readiness/default-user";
import type { LifecycleReadinessStage } from "@/lib/readiness/lifecycle";

export async function LifecycleReadinessContext({ stages, title }: { stages?: LifecycleReadinessStage[]; title?: string }) {
  const result = await getLifecycleReadinessForDefaultUser();
  if (!result) return null;

  return <LifecycleContextPanel readiness={result.readiness} stages={stages} title={title} />;
}
