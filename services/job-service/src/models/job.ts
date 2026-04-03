export interface Job {
  id: string;
  user_id: string;
  company_name?: string;
  position_title: string;
  job_url?: string;
  description?: string;
  location?: string;
  salary_range?: string;
  keywords: string[];
  work_location: 'in_person' | 'remote' | 'hybrid';
  employment_type: 'full_time' | 'part_time' | 'contract' | 'internship';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateJobDto {
  company_name?: string;
  position_title: string;
  job_url?: string;
  description?: string;
  location?: string;
  salary_range?: string;
  keywords?: string[];
  work_location?: 'in_person' | 'remote' | 'hybrid';
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'internship';
}

export interface UpdateJobDto extends Partial<CreateJobDto> {
  is_active?: boolean;
}

export interface ListJobsOptions {
  page?: number;
  limit?: number;
  isActive?: boolean;
}

export interface PaginatedJobs {
  data: Job[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
