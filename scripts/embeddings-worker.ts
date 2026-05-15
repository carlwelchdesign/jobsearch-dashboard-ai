import { backfillCandidateEvidence } from "@/lib/evidence/ingest";
import { backfillEvidenceEmbeddings } from "@/lib/evidence/embeddings";
import { prisma } from "@/lib/prisma";

const intervalMs = positiveNumber(process.env.EMBEDDINGS_WORKER_INTERVAL_MS, 10 * 60 * 1000);
const batchSize = positiveNumber(process.env.EMBEDDINGS_WORKER_BATCH_SIZE, 50);
const backfillEvidenceOnStart = process.env.EMBEDDINGS_WORKER_BACKFILL_EVIDENCE === "true";
let shuttingDown = false;
let wakeWorker: (() => void) | null = null;

process.on("SIGINT", () => {
  requestShutdown();
});

process.on("SIGTERM", () => {
  requestShutdown();
});

function requestShutdown() {
  shuttingDown = true;
  wakeWorker?.();
}

async function main() {
  console.log(`Embeddings worker starting. intervalMs=${intervalMs} batchSize=${batchSize}`);
  if (backfillEvidenceOnStart) {
    const evidence = await backfillCandidateEvidence();
    console.log(`Evidence backfill complete. count=${evidence.length}`);
  }

  while (!shuttingDown) {
    const startedAt = Date.now();
    const result = await backfillEvidenceEmbeddings({ limit: batchSize });
    console.log(JSON.stringify({ worker: "embeddings", ...result, durationMs: Date.now() - startedAt }));
    await sleep(intervalMs);
  }

  await prisma.$disconnect();
  console.log("Embeddings worker stopped.");
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    const finish = () => {
      wakeWorker = null;
      resolve(undefined);
    };
    const timeout = setTimeout(finish, ms);
    wakeWorker = () => {
      clearTimeout(timeout);
      finish();
    };
  });
}

main().catch(async (error) => {
  console.error("Embeddings worker failed.", error);
  await prisma.$disconnect();
  process.exit(1);
});
