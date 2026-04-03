-- Migration 004: Add Transactional Outbox table
-- The outbox table is used by services to atomically record domain events
-- alongside their own write operations.  A separate outbox worker polls
-- this table and publishes events to Redis Streams.

CREATE TABLE IF NOT EXISTS public.outbox (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dot-namespaced event type, e.g. "resume.created"
  event_type    TEXT        NOT NULL,
  -- Originating service, e.g. "resume-service"
  source        TEXT        NOT NULL,
  -- Full JSON event envelope (DomainEvent<T>)
  payload       JSONB       NOT NULL,
  -- ISO-8601 timestamp when the event was written
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set once the outbox worker has successfully published the event
  published_at  TIMESTAMPTZ,
  -- Number of publish attempts (for retry/DLQ logic)
  retry_count   INT         NOT NULL DEFAULT 0,
  -- Last error message (null when last attempt succeeded)
  last_error    TEXT
);

-- Index for the outbox worker: fetch unpublished events ordered by age
CREATE INDEX IF NOT EXISTS outbox_unpublished_idx
  ON public.outbox (created_at ASC)
  WHERE published_at IS NULL;

-- Allow the service-role key full access (outbox is server-side only)
ALTER TABLE public.outbox ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so no user-facing policies needed.
-- Explicitly deny direct access from anon/authenticated roles.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'outbox' AND policyname = 'deny_public_outbox'
  ) THEN
    CREATE POLICY deny_public_outbox ON public.outbox
      FOR ALL TO anon, authenticated
      USING (false);
  END IF;
END
$$;
