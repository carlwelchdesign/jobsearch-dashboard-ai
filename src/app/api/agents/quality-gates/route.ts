import { apiError } from "@/lib/api";
import { requireSingleUser } from "@/lib/auth/single-user";
import { buildAgentQualityGates } from "@/lib/agents/quality-gates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSingleUser(request);
    const gates = await buildAgentQualityGates({ userId: user.id });
    return Response.json(gates);
  } catch (error) {
    return apiError(error, 401);
  }
}
