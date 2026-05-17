import { apiError } from "@/lib/api";
import { acceptImprovementProposal } from "@/lib/observability/quality";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const result = await acceptImprovementProposal(params.id);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error, 400);
  }
}
