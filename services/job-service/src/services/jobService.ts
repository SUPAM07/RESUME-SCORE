import { supabaseAdmin } from '../utils/supabase.js';
import { NotFoundError, AuthorizationError } from '../utils/errors.js';
import { writeToOutbox } from '../utils/outbox.js';
import type { Job, CreateJobDto, UpdateJobDto, ListJobsOptions, PaginatedJobs } from '../models/job.ts';

export const jobService = {
  async list(userId: string, opts: ListJobsOptions = {}): Promise<PaginatedJobs> {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const from = (page - 1) * limit;

    let q = supabaseAdmin.from('jobs').select('*', { count: 'exact' }).eq('user_id', userId);
    if (opts.isActive !== undefined) q = q.eq('is_active', opts.isActive);
    const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, from + limit - 1);
    if (error) throw new Error(error.message);
    return { data: data ?? [], total: count ?? 0, page, limit, totalPages: Math.ceil((count ?? 0) / limit) };
  },

  async getById(userId: string, id: string): Promise<Job> {
    const { data, error } = await supabaseAdmin.from('jobs').select('*').eq('id', id).single();
    if (error || !data) throw new NotFoundError(`Job ${id} not found`);
    if (data.user_id !== userId) throw new AuthorizationError();
    return data as Job;
  },

  async create(userId: string, dto: CreateJobDto): Promise<Job> {
    const { data, error } = await supabaseAdmin.from('jobs').insert({
      user_id: userId,
      company_name: dto.company_name,
      position_title: dto.position_title,
      job_url: dto.job_url,
      description: dto.description,
      location: dto.location,
      salary_range: dto.salary_range,
      keywords: dto.keywords ?? [],
      work_location: dto.work_location ?? 'in_person',
      employment_type: dto.employment_type ?? 'full_time',
      is_active: true,
    }).select().single();
    if (error) throw new Error(error.message);
    const job = data as Job;
    // Publish domain event via outbox (fire-and-forget)
    void writeToOutbox('job.created', {
      jobId: job.id,
      userId,
      company: job.company_name,
      positionTitle: job.position_title,
    });
    return job;
  },

  async update(userId: string, id: string, dto: UpdateJobDto): Promise<Job> {
    await this.getById(userId, id); // ownership check
    const { data, error } = await supabaseAdmin.from('jobs').update(dto).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    // Publish domain event via outbox (fire-and-forget)
    void writeToOutbox('job.updated', { jobId: id, userId, fields: Object.keys(dto) });
    return data as Job;
  },

  async delete(userId: string, id: string): Promise<void> {
    await this.getById(userId, id); // ownership check
    const { error } = await supabaseAdmin.from('jobs').delete().eq('id', id);
    if (error) throw new Error(error.message);
    // Publish domain event via outbox (fire-and-forget)
    void writeToOutbox('job.deleted', { jobId: id, userId });
  },
};
