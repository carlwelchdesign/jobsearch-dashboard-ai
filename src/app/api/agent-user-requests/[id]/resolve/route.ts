import { z } from "zod";
import { apiError } from "@/lib/api";
import { resolveAgentUserRequest } from "@/lib/agent-user-requests";

export const dynamic = "force-dynamic";

const resolveRequestSchema = z.object({
  status: z.enum(["ANSWERED", "DISMISSED", "RESOLVED"]).optional(),
  answer: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = resolveRequestSchema.parse(await request.json().catch(() => ({})));
    const result = await resolveAgentUserRequest({
      id: params.id,
      status: body.status,
      answer: body.answer,
    });

    return Response.json({
      id: result.id,
      status: result.status,
      message: result.status === "ANSWERED" ? "Answer saved." : "Request resolved.",
    });
  } catch (error) {
    return apiError(error, 400);
  }
}
