import { prisma } from "@/lib/prisma";

let cachedAvailability: boolean | null = null;

export async function pgVectorSearchAvailable() {
  if (cachedAvailability !== null) return cachedAvailability;
  try {
    const rows = await prisma.$queryRaw<Array<{ available: boolean }>>`
      SELECT (
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'EvidenceEmbedding'
            AND column_name = 'vectorSearch'
        )
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'EvidenceChunk'
            AND column_name = 'vectorSearch'
        )
      ) AS available
    `;
    cachedAvailability = rows[0]?.available === true;
    return cachedAvailability;
  } catch {
    cachedAvailability = false;
    return false;
  }
}
