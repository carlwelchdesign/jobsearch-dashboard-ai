import { apiError } from "@/lib/api";
import { approveApplicationPacket } from "@/lib/applications/application-packets";
import { reconcileApplicationCanonicalState } from "@/lib/applications/reconciliation";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const result = await approveApplicationPacket(params.id);
    await reconcileApplicationCanonicalState({ applicationId: params.id, source: "packet_approval" }).catch(() => null);
    return Response.json({
      packetId: result.packet.id,
      status: result.packet.status,
      message: result.message,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
