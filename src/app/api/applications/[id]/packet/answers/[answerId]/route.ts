import { apiError } from "@/lib/api";
import { deleteApplicationPacketAnswer } from "@/lib/applications/application-packets";

export const dynamic = "force-dynamic";

export async function DELETE(_: Request, { params }: { params: { id: string; answerId: string } }) {
  try {
    const result = await deleteApplicationPacketAnswer(params.id, params.answerId);
    return Response.json(result);
  } catch (error) {
    return apiError(error, 400);
  }
}
