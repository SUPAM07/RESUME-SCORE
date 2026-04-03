-- Migration 002: Performance Indexes
-- Add indexes to improve query performance for common access patterns

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles(updated_at DESC);

-- Resumes indexes
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON public.resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_job_id ON public.resumes(job_id);
CREATE INDEX IF NOT EXISTS idx_resumes_is_base_resume ON public.resumes(is_base_resume);
CREATE INDEX IF NOT EXISTS idx_resumes_user_id_updated_at ON public.resumes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_resumes_user_id_is_base ON public.resumes(user_id, is_base_resume);

-- Jobs indexes
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
-- Composite index covering user_id + updated_at for sorted list queries
CREATE INDEX IF NOT EXISTS idx_jobs_user_id_updated_at ON public.jobs(user_id, updated_at DESC);
-- Composite index covering user_id + is_active; useful for "active jobs per user" queries
CREATE INDEX IF NOT EXISTS idx_jobs_user_id_is_active ON public.jobs(user_id, is_active);

-- Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_status ON public.subscriptions(subscription_plan, subscription_status);

-- Stripe webhook events indexes
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type ON public.stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at ON public.stripe_webhook_events(created_at DESC);

-- JSONB GIN indexes for full-text search within JSONB fields
CREATE INDEX IF NOT EXISTS idx_resumes_work_experience_gin ON public.resumes USING GIN(work_experience);
CREATE INDEX IF NOT EXISTS idx_resumes_skills_gin ON public.resumes USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_profiles_work_experience_gin ON public.profiles USING GIN(work_experience);
CREATE INDEX IF NOT EXISTS idx_profiles_skills_gin ON public.profiles USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_jobs_keywords_gin ON public.jobs USING GIN(keywords);
