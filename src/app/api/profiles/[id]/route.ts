import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  remotePreference: z.enum(["remote_us_only", "remote_global", "remote_europe", "hybrid", "onsite_relocation", "any"]).optional(),
  salaryCurrency: z.enum(["USD", "EUR", "GBP", "SEK"]).optional(),
  salaryMin: z.number().nullable().optional(),
  minimumMatchScore: z.number().int().min(0).max(100).optional(),
  maxResultsPerRun: z.number().int().min(1).max(250).optional(),
  titles: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  keywordsPreferred: z.array(z.string()).optional(),
  keywordsExcluded: z.array(z.string()).optional(),
  excludedCompanies: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = patchSchema.parse(await request.json());
    const profile = await prisma.jobSearchProfile.update({
      where: { id: params.id },
      data: {
        ...body,
        ...(body.titles ? { titles: body.titles as Prisma.InputJsonValue } : {}),
        ...(body.countries ? { countries: body.countries as Prisma.InputJsonValue } : {}),
        ...(body.keywordsPreferred ? { keywordsPreferred: body.keywordsPreferred as Prisma.InputJsonValue } : {}),
        ...(body.keywordsExcluded ? { keywordsExcluded: body.keywordsExcluded as Prisma.InputJsonValue } : {}),
        ...(body.excludedCompanies ? { excludedCompanies: body.excludedCompanies as Prisma.InputJsonValue } : {}),
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A search profile with that name already exists." }, { status: 409 });
    }
    return apiError(error, 400);
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.jobSearchProfile.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 400);
  }
}
