export interface WorkExperience {
  position: string;
  company: string;
  location?: string;
  start_date: string;
  end_date?: string;
  description?: string;
  responsibilities: string[];
}

export interface Education {
  degree: string;
  institution: string;
  location?: string;
  graduation_date: string;
  gpa?: string;
  achievements?: string[];
}

export interface Skills {
  category: string;
  skills: string[];
}

export interface PersonalInfo {
  full_name: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export interface Resume {
  id: string;
  user_id: string;
  name: string;
  is_base_resume: boolean;
  job_id?: string;
  personal_info?: PersonalInfo;
  summary?: string;
  work_experience: WorkExperience[];
  education: Education[];
  skills: Skills[];
  created_at: string;
  updated_at: string;
}

export interface CreateResumeDto {
  name: string;
  is_base_resume?: boolean;
  job_id?: string;
  personal_info?: PersonalInfo;
  summary?: string;
  work_experience?: WorkExperience[];
  education?: Education[];
  skills?: Skills[];
}

export interface UpdateResumeDto extends Partial<CreateResumeDto> {}
