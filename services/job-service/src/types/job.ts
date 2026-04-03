export interface Job {
  id: string;
  user_id: string;
  title: string;
  company: string;
  location?: string;
  description: string;
  url?: string;
  salary_range?: string;
  employment_type?: 'full-time' | 'part-time' | 'contract' | 'freelance' | 'internship';
  status?: 'active' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'closed';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateJobDto {
  title: string;
  company: string;
  location?: string;
  description: string;
  url?: string;
  salary_range?: string;
  employment_type?: Job['employment_type'];
  status?: Job['status'];
  notes?: string;
}

export interface UpdateJobDto extends Partial<CreateJobDto> {}
