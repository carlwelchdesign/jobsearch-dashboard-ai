import { apiError } from "@/lib/api";
import { repairApplicationMaterialIssue } from "@/lib/applications/material-quality-repair";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";

export const dynamic = "force-dynamic";

const runningApplicationRepairs = new Set<string>();

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    if (request.headers.get("x-run-in-background") === "1") {
      const alreadyRunning = runningApplicationRepairs.has(params.id);
      if (!alreadyRunning) {
        runningApplicationRepairs.add(params.id);
        setTimeout(() => {
          void repairAndReconcile(params.id)
            .catch((error) => {
              console.error("Application material repair failed", error);
            })
            .finally(() => {
              runningApplicationRepairs.delete(params.id);
            });
        }, 0);
      }
      return Response.json({
        accepted: true,
        alreadyRunning,
        applicationId: params.id,
        message: alreadyRunning
          ? "Material repair is already running for this application."
          : "Agents are fixing the material issue. Refresh this page in a few minutes to see the result.",
      }, { status: 202 });
    }
    const result = await repairAndReconcile(params.id);
    return Response.json({
      ...result,
      message: result.status === "repaired"
        ? "Agents fixed the material issue. Moved to Ready to apply."
        : result.status === "blocked"
          ? blockedMessage(result)
          : `Material repair failed. ${result.reason}`,
    }, { status: result.status === "failed" ? 500 : 200 });
  } catch (error) {
    return apiError(error, 400);
  }
}

async function repairAndReconcile(applicationId: string) {
  const result = await repairApplicationMaterialIssue(applicationId);
  await reconcileApplicationCanonicalState({ applicationId, source: "application_material_issue_repair" }).catch(() => null);
  return result;
}

function blockedMessage(result: Awaited<ReturnType<typeof repairApplicationMaterialIssue>>) {
  const unsupported = result.remainingUnsupportedClaims?.length
    ? ` Remaining unsupported claims: ${result.remainingUnsupportedClaims.join("; ")}.`
    : "";
  const reasons = result.remainingReasons?.length
    ? ` Remaining QA reasons: ${result.remainingReasons.map((reason) => reason.replace(/_/g, " ")).join(", ")}.`
    : "";
  const prefix = result.attemptedRepair
    ? "Agents rewrote the materials, but QA still found issues."
    : "Agents could not start repair.";
  return `${prefix}${unsupported}${reasons} ${result.recommendation}`.trim();
}
