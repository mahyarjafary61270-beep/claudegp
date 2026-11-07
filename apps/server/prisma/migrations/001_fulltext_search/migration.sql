-- Full-text search over messages ('simple' config works for mixed Persian/Latin text)
-- NOTE: Prisma names tables after the model, e.g. "Message".
ALTER TABLE "Message" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED;

CREATE INDEX "message_search_idx" ON "Message" USING GIN ("search_vector");
