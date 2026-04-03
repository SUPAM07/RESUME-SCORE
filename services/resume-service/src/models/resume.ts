/**
 * @module models/resume
 * Resume domain types — aligned with the shared canonical types and the
 * Supabase `resumes` table schema.
 */

// ---------------------------------------------------------------------------
// Section content types
// ---------------------------------------------------------------------------

export interface WorkExperience {
  position: string;
  company: string;
  location?: string;
  date: string;
  description: string[];
  technologies?: string[];
}

export interface Education {
  school: string;
  degree: string;
  field: string;
  location?: string;
  date: string;
  gpa?: number | string;
  achievements?: string[];
}

export interface Project {
  name: string;
  description: string[];
  date?: string;
  technologies?: string[];
  url?: string;
  github_url?: string;
}

export interface Skill {
  category: string;
  items: string[];
}

export interface Certification {
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

export interface SectionConfig {
  visible: boolean;
  max_items?: number | null;
  style?: 'grouped' | 'list' | 'grid';
}

export interface DocumentSettings {
  document_font_size: number;
  document_line_height: number;
  document_margin_vertical: number;
  document_margin_horizontal: number;
  header_name_size: number;
  header_name_bottom_spacing: number;
  skills_margin_top: number;
  skills_margin_bottom: number;
  skills_margin_horizontal: number;
  skills_item_spacing: number;
  experience_margin_top: number;
  experience_margin_bottom: number;
  experience_margin_horizontal: number;
  experience_item_spacing: number;
  projects_margin_top: number;
  projects_margin_bottom: number;
  projects_margin_horizontal: number;
  projects_item_spacing: number;
  education_margin_top: number;
  education_margin_bottom: number;
  education_margin_horizontal: number;
  education_item_spacing: number;
  show_ubc_footer?: boolean;
  footer_width?: number;
}

// ---------------------------------------------------------------------------
// Core Resume entity
// ---------------------------------------------------------------------------

export interface Resume {
  id: string;
  user_id: string;
  job_id?: string | null;
  is_base_resume: boolean;
  name: string;
  target_role: string;
  resume_title?: string | null;

  // Contact / header
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string | null;
  location?: string | null;
  website?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  professional_summary?: string | null;

  // Content sections
  work_experience: WorkExperience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];
  certifications: Certification[];

  // Layout
  section_order?: string[] | null;
  section_configs?: Record<string, SectionConfig> | null;
  document_settings?: DocumentSettings | null;

  // Cover letter
  has_cover_letter: boolean;
  cover_letter?: Record<string, unknown> | null;

  created_at: string;
  updated_at: string;
}

/** Lightweight list view — omits large content arrays. */
export interface ResumeSummary {
  id: string;
  user_id: string;
  job_id?: string | null;
  is_base_resume: boolean;
  name: string;
  target_role: string;
  resume_title?: string | null;
  has_cover_letter: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Request / response bodies
// ---------------------------------------------------------------------------

export interface CreateResumeBody {
  name: string;
  target_role: string;
  job_id?: string | null;
  is_base_resume?: boolean;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string | null;
  location?: string | null;
  website?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  professional_summary?: string | null;
  work_experience?: WorkExperience[];
  education?: Education[];
  skills?: Skill[];
  projects?: Project[];
  certifications?: Certification[];
  section_order?: string[];
  section_configs?: Record<string, SectionConfig>;
  document_settings?: DocumentSettings;
  has_cover_letter?: boolean;
  cover_letter?: Record<string, unknown> | null;
}

export interface CreateBaseResumeBody extends CreateResumeBody {
  is_base_resume: true;
}

export type UpdateResumeBody = Partial<Omit<CreateResumeBody, 'is_base_resume'>>;

export interface ListResumesQuery {
  page?: string;
  limit?: string;
  is_base_resume?: string;
}
