BEGIN;

-- The global daily spend cap sums tokens for `created_at >= 00:00 UTC` on every
-- proposal, and the metrics endpoint reads the same window. The existing indexes
-- on ai_requests lead with app_id, so that filter could not use them and fell back
-- to scanning the whole audit table. This one is keyed on the column both queries
-- actually range over.
CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at ON ai_requests(created_at);

COMMIT;
