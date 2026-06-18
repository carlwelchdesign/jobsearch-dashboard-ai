import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireSingleUser } from "@/lib/auth/single-user";
import { loadJoleneConversation, normalizeContextPath, sendJoleneMessage } from "@/lib/jolene/chat";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  contextPath: z.string().trim().min(1).max(500).default("/dashboard"),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const contextPath = normalizeContextPath(url.searchParams.get("contextPath") ?? "/dashboard");
    const user = await requireSingleUser(request, { allowMultipleUsers: true });

    return NextResponse.json(await loadJoleneConversation({ userId: user.id, contextPath }));
  } catch (error) {
    return apiError(error, 400);
  }
}

export async function POST(request: Request) {
  try {
    const body = messageSchema.parse(await request.json());
    const user = await requireSingleUser(request, { allowMultipleUsers: true });

    return NextResponse.json(await sendJoleneMessage({
      userId: user.id,
      message: body.message,
      contextPath: body.contextPath,
    }));
  } catch (error) {
    return apiError(error, 400);
  }
}
