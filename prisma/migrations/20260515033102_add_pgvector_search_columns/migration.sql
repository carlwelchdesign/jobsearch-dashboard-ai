DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;

    ALTER TABLE "EvidenceChunk" ADD COLUMN IF NOT EXISTS "vectorSearch" vector(1536);
    ALTER TABLE "EvidenceEmbedding" ADD COLUMN IF NOT EXISTS "vectorSearch" vector(1536);

    CREATE INDEX IF NOT EXISTS "EvidenceChunk_vectorSearch_hnsw_idx" ON "EvidenceChunk" USING hnsw ("vectorSearch" vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS "EvidenceEmbedding_vectorSearch_hnsw_idx" ON "EvidenceEmbedding" USING hnsw ("vectorSearch" vector_cosine_ops);
  END IF;
END $$;
