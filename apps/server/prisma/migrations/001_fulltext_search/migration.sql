-- Full-text search over messages ('simple' config works for mixed Persian/Latin text)
ALTER TABLE "messages" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED;

CREATE INDEX "messages_search_idx" ON "messages" USING GIN ("search_vector");

-- Rank aid for recency-weighted ordering
CREATE INDEX "messages_created_at_idx" ON "messages" ("createdAt");
