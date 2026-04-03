-- Migration 006: Add Events Audit Log table
-- Persistent audit trail of every domain event that has been successfully
-- published to Redis Streams.  Useful for debugging, replay, and compliance.

CREATE TABLE IF NOT EXISTS public.events_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Matches DomainEvent.id (the event's own UUID)
  event_id       UUID        NOT NULL UNIQUE,
  event_type     TEXT        NOT NULL,
  source         TEXT        NOT NULL,
  version        TEXT        NOT NULL DEFAULT '1.0',
  correlation_id TEXT,
  -- Full serialised event envelope
  payload        JSONB       NOT NULL,
  published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying by event type or by correlation ID
CREATE INDEX IF NOT EXISTS events_audit_log_type_idx
  ON public.events_audit_log (event_type, published_at DESC);

CREATE INDEX IF NOT EXISTS events_audit_log_correlation_idx
  ON public.events_audit_log (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- Audit log is insert-only from service-role; deny all public access
ALTER TABLE public.events_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'events_audit_log' AND policyname = 'deny_public_events_audit'
  ) THEN
    CREATE POLICY deny_public_events_audit ON public.events_audit_log
      FOR ALL TO anon, authenticated
      USING (false);
  END IF;
END
$$;
