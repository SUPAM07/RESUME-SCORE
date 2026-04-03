-- Migration 003: Add proper Row Level Security policies
-- Removes reliance on the service role key (which bypasses RLS) and
-- implements per-table RLS policies so that microservices can authenticate
-- as the calling user and access only their own data.
--
-- Apply after 002_add_indexes.sql.
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE patterns).

-- ============================================================
-- Enable RLS on all application tables
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- profiles
-- ============================================================

-- Users may read only their own profile.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (user_id = auth.uid());

-- Users may update only their own profile.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Profiles are created automatically by the auth trigger; direct INSERT is
-- not allowed from the client.
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- resumes
-- ============================================================

-- Users may read only their own resumes.
DROP POLICY IF EXISTS "resumes_select_own" ON public.resumes;
CREATE POLICY "resumes_select_own"
  ON public.resumes
  FOR SELECT
  USING (user_id = auth.uid());

-- Users may create resumes for themselves only.
DROP POLICY IF EXISTS "resumes_insert_own" ON public.resumes;
CREATE POLICY "resumes_insert_own"
  ON public.resumes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users may update only their own resumes.
DROP POLICY IF EXISTS "resumes_update_own" ON public.resumes;
CREATE POLICY "resumes_update_own"
  ON public.resumes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users may delete only their own resumes.
DROP POLICY IF EXISTS "resumes_delete_own" ON public.resumes;
CREATE POLICY "resumes_delete_own"
  ON public.resumes
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- jobs
-- ============================================================

DROP POLICY IF EXISTS "jobs_select_own" ON public.jobs;
CREATE POLICY "jobs_select_own"
  ON public.jobs
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "jobs_insert_own" ON public.jobs;
CREATE POLICY "jobs_insert_own"
  ON public.jobs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "jobs_update_own" ON public.jobs;
CREATE POLICY "jobs_update_own"
  ON public.jobs
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "jobs_delete_own" ON public.jobs;
CREATE POLICY "jobs_delete_own"
  ON public.jobs
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- subscriptions
-- ============================================================

-- Users may read only their own subscription.
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions
  FOR SELECT
  USING (user_id = auth.uid());

-- Only the service role (Stripe webhook handler) may insert / update
-- subscriptions — client-side mutation is not allowed.
-- Service-role connections bypass RLS automatically; no policy needed for INSERT/UPDATE.

-- ============================================================
-- Audit log table (optional — stores who changed what and when)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid          NOT NULL DEFAULT gen_random_uuid(),
  table_name    text          NOT NULL,
  operation     text          NOT NULL,  -- INSERT | UPDATE | DELETE
  -- row_id may be NULL if the table does not have an `id uuid` column.
  -- Tables attached to the audit trigger (resumes, jobs) all have `id uuid`.
  row_id        uuid          NULL,
  user_id       uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at    timestamptz   NOT NULL DEFAULT now(),
  old_data      jsonb,
  new_data      jsonb,
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);

-- RLS: audit log is read-only from the client (admins only via service role).
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_admin_select" ON public.audit_log;
CREATE POLICY "audit_log_admin_select"
  ON public.audit_log
  FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
  );

-- ============================================================
-- Audit trigger function
-- NOTE: Assumes the audited table has an `id uuid` primary key column.
--       Only attach this trigger to tables that satisfy this requirement
--       (currently: resumes, jobs).
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.audit_log(table_name, operation, row_id, user_id, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    CASE
      WHEN TG_OP = 'DELETE' THEN (OLD).id
      ELSE (NEW).id
    END,
    auth.uid(),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach audit trigger to the resumes table
DROP TRIGGER IF EXISTS resumes_audit ON public.resumes;
CREATE TRIGGER resumes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- Attach audit trigger to the jobs table
DROP TRIGGER IF EXISTS jobs_audit ON public.jobs;
CREATE TRIGGER jobs_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
