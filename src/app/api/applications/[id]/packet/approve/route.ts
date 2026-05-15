import { apiError } from "@/lib/api";
import { approveApplicationPacket } from "@/lib/applications/application-packets";

export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const result = await approveApplicationPacket(params.id);
    return Response.json({
      packetId: result.packet.id,
      status: result.packet.status,
      message: result.message,
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
