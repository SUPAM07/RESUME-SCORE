-- Migration 005: Add Notification table
-- Stores persistent notifications for users.  The notification-service
-- writes to this table; the frontend reads via SSE or REST polling.

CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Category: "info" | "success" | "warning" | "error"
  level        TEXT        NOT NULL DEFAULT 'info',
  -- Short title shown in the toast/notification panel
  title        TEXT        NOT NULL,
  -- Optional longer description
  body         TEXT,
  -- Dot-namespaced event type that triggered this notification
  event_type   TEXT,
  -- Link the notification can navigate to (relative URL)
  action_url   TEXT,
  -- Whether the user has dismissed/read this notification
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching a user's unread notifications efficiently
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- RLS: users may only see and manage their own notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications' AND policyname = 'notifications_owner'
  ) THEN
    CREATE POLICY notifications_owner ON public.notifications
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
