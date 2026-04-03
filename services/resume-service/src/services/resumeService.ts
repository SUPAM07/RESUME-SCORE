/**
 * @module services/resumeService
 * Resume CRUD operations backed by Supabase (service-role client).
 * All queries are scoped to the authenticated user's `user_id` for safety.
 */

import { getSupabaseClient } from '../utils/supabase.js';
import { DatabaseError, NotFoundError, AuthorizationError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
import { writeToOutbox } from '../utils/outbox.js';
import type {
  Resume,
  ResumeSummary,
  CreateResumeBody,
  UpdateResumeBody,
} from '../models/resume.js';

const logger = createLogger('resumeService');

const SUMMARY_COLUMNS =
  'id,user_id,job_id,is_base_resume,name,target_role,resume_title,has_cover_letter,created_at,updated_at';

export interface ListResumesOptions {
  userId: string;
  page: number;
  limit: number;
  isBaseResume?: boolean;
}

export interface PaginatedResumes {
  data: ResumeSummary[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}

export async function listResumes(opts: ListResumesOptions): Promise<PaginatedResumes> {
  const { userId, page, limit, isBaseResume } = opts;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const client = getSupabaseClient();

  let query = client
    .from('resumes')
    .select(SUMMARY_COLUMNS, { count: 'exact' })
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (isBaseResume !== undefined) {
    query = query.eq('is_base_resume', isBaseResume);
  }

  const { data, error, count } = await query;

  if (error) {
    logger.error('Failed to list resumes', { userId, error: error.message });
    throw new DatabaseError('Failed to list resumes', error);
  }

  const total = count ?? 0;
  return {
    data: (data ?? []) as ResumeSummary[],
    total,
    page,
    limit,
    hasNextPage: from + limit < total,
  };
}

export async function getResumeById(id: string, userId: string): Promise<Resume> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('resumes')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    throw new NotFoundError('Resume', id);
  }

  if ((data as Resume).user_id !== userId) {
    throw new AuthorizationError('You do not have access to this resume');
  }

  return data as Resume;
}

export async function createResume(
  userId: string,
  body: CreateResumeBody,
): Promise<Resume> {
  const client = getSupabaseClient();

  const payload = {
    user_id: userId,
    ...body,
    work_experience: body.work_experience ?? [],
    education: body.education ?? [],
    skills: body.skills ?? [],
    projects: body.projects ?? [],
    certifications: body.certifications ?? [],
    has_cover_letter: body.has_cover_letter ?? false,
    is_base_resume: body.is_base_resume ?? false,
  };

  const { data, error } = await client
    .from('resumes')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    logger.error('Failed to create resume', { userId, error: error?.message });
    throw new DatabaseError('Failed to create resume', error);
  }

  const resume = data as Resume;
  logger.info('Resume created', { resumeId: resume.id, userId });

  // Publish domain event via outbox (fire-and-forget)
  void writeToOutbox('resume.created', {
    resumeId: resume.id,
    userId,
    resumeType: resume.is_base_resume ? 'base' : 'tailored',
    jobId: resume.job_id ?? undefined,
  });

  return resume;
}

export async function updateResume(
  id: string,
  userId: string,
  body: UpdateResumeBody,
): Promise<Resume> {
  // Verify ownership first
  await getResumeById(id, userId);

  const client = getSupabaseClient();

  const { data, error } = await client
    .from('resumes')
    .update(body)
    .eq('id', id)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    logger.error('Failed to update resume', { id, userId, error: error?.message });
    throw new DatabaseError('Failed to update resume', error);
  }

  logger.info('Resume updated', { resumeId: id, userId });

  // Publish domain event via outbox (fire-and-forget)
  void writeToOutbox('resume.updated', {
    resumeId: id,
    userId,
    fields: Object.keys(body),
  });

  return data as Resume;
}

export async function deleteResume(id: string, userId: string): Promise<void> {
  // Verify ownership first
  await getResumeById(id, userId);

  const client = getSupabaseClient();

  const { error } = await client
    .from('resumes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    logger.error('Failed to delete resume', { id, userId, error: error.message });
    throw new DatabaseError('Failed to delete resume', error);
  }

  logger.info('Resume deleted', { resumeId: id, userId });

  // Publish domain event via outbox (fire-and-forget)
  void writeToOutbox('resume.deleted', { resumeId: id, userId });
}

export async function duplicateResume(id: string, userId: string): Promise<Resume> {
  const source = await getResumeById(id, userId);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = source;

  return createResume(userId, {
    ...rest,
    name: `${source.name} (copy)`,
  });
}
