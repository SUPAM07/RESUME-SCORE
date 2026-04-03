/**
 * @module @resume-lm/shared/types
 *
 * Canonical shared TypeScript types for the ResumeLM microservices architecture.
 * These types mirror the Supabase/PostgreSQL schema and are the single source of
 * truth for all inter-service communication.
 *
 * Keep this file free of runtime code — types and interfaces only.
 */

// ---------------------------------------------------------------------------
// Resume content section types
// ---------------------------------------------------------------------------

/**
 * A single entry in the work experience section of a resume or profile.
 * The `description` field is stored as an array of bullet-point strings.
 */
export interface WorkExperience {
  /** Job title / role held */
  position: string;
  /** Employer name */
  company: string;
  /** Office / remote location */
  location?: string;
  /**
   * Human-readable date range, e.g. "Jan 2021 – Present".
   * Stored as a single string to support flexible formatting.
   */
  date: string;
  /** Bullet-point descriptions rendered under the role */
  description: string[];
  /** Notable technologies used in this role */
  technologies?: string[];
}

/**
 * A single entry in the education section.
 */
export interface Education {
  /** Institution / university name */
  school: string;
  /** Degree type, e.g. "Bachelor of Science" */
  degree: string;
  /** Major / field of study */
  field: string;
  /** Campus or city */
  location?: string;
  /**
   * Human-readable graduation date or date range,
   * e.g. "May 2022" or "Sep 2018 – Apr 2022".
   */
  date: string;
  /** Grade Point Average – number or formatted string (e.g. "3.9 / 4.0") */
  gpa?: number | string;
  /** Notable honours, awards, or coursework */
  achievements?: string[];
}

/**
 * A project entry displayed on a resume or profile.
 */
export interface Project {
  /** Project / product name */
  name: string;
  /** Bullet-point descriptions of contributions and outcomes */
  description: string[];
  /**
   * Completion or active date range,
   * e.g. "Mar 2023" or "Jan – Jun 2023".
   */
  date?: string;
  /** Primary technologies / languages / frameworks used */
  technologies?: string[];
  /** Live deployment URL */
  url?: string;
  /** Source-code repository URL */
  github_url?: string;
}

/**
 * A grouped skill category, e.g. `{ category: "Languages", items: ["TypeScript", "Go"] }`.
 */
export interface Skill {
  /** Human-readable category label */
  category: string;
  /** Skills that belong to this category */
  items: string[];
}

// ---------------------------------------------------------------------------
// Resume document-layout types
// ---------------------------------------------------------------------------

/**
 * Per-section display controls embedded in a resume document.
 */
export interface SectionConfig {
  /** Whether the section is rendered in the exported PDF */
  visible: boolean;
  /** Maximum number of items to include; `null` means unlimited */
  max_items?: number | null;
  /** Visual layout variant for the section */
  style?: 'grouped' | 'list' | 'grid';
}

/**
 * Fine-grained typography and spacing settings stored with each resume.
 * All numeric values are in points unless otherwise noted.
 */
export interface DocumentSettings {
  // ---- Global ----
  document_font_size: number;
  document_line_height: number;
  document_margin_vertical: number;
  document_margin_horizontal: number;

  // ---- Header ----
  header_name_size: number;
  header_name_bottom_spacing: number;

  // ---- Skills ----
  skills_margin_top: number;
  skills_margin_bottom: number;
  skills_margin_horizontal: number;
  skills_item_spacing: number;

  // ---- Work experience ----
  experience_margin_top: number;
  experience_margin_bottom: number;
  experience_margin_horizontal: number;
  experience_item_spacing: number;

  // ---- Projects ----
  projects_margin_top: number;
  projects_margin_bottom: number;
  projects_margin_horizontal: number;
  projects_item_spacing: number;

  // ---- Education ----
  education_margin_top: number;
  education_margin_bottom: number;
  education_margin_horizontal: number;
  education_item_spacing: number;

  /** Display the UBC-branded footer in the PDF export */
  show_ubc_footer?: boolean;
  /** Width of the footer as a percentage of the page width */
  footer_width?: number;
}

// ---------------------------------------------------------------------------
// Core domain entities
// ---------------------------------------------------------------------------

/**
 * User profile — the master record that holds a person's canonical resume
 * content.  Resumes are derived from / linked to a profile.
 */
export interface Profile {
  /** UUID primary key (Supabase auth.users id) */
  id: string;
  /** Foreign key → auth.users */
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  location: string | null;
  website: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  /** Reserved for platform administration */
  is_admin?: boolean | null;
  work_experience: WorkExperience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

/**
 * A resume document — either a base resume or a job-tailored resume.
 * All contact / content fields are denormalised so the document is
 * self-contained for PDF generation.
 */
export interface Resume {
  /** UUID primary key */
  id: string;
  /** Foreign key → auth.users */
  user_id: string;
  /** Foreign key → jobs; `null` for base resumes */
  job_id?: string | null;
  /** User-facing label, e.g. "Software Engineer @ Acme" */
  name: string;
  /** Desired role targeted by this resume */
  target_role: string;
  /** `true` for a base (master) resume; `false` for a tailored copy */
  is_base_resume: boolean;

  // ---- Contact / header fields ----
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  location?: string;
  website?: string;
  linkedin_url?: string;
  github_url?: string;

  // ---- Content sections ----
  work_experience: WorkExperience[];
  education: Education[];
  skills: Skill[];
  projects: Project[];

  // ---- Layout ----
  /** Ordered list of section keys, e.g. ["work_experience", "education", "skills"] */
  section_order?: string[];
  /** Per-section display configuration keyed by section name */
  section_configs?: Record<string, SectionConfig>;
  document_settings?: DocumentSettings;

  // ---- Cover letter ----
  has_cover_letter: boolean;
  cover_letter?: Record<string, unknown> | null;

  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

/**
 * Lightweight resume summary returned by list endpoints.
 * Omits large content arrays to keep payloads small.
 */
export interface ResumeSummary {
  id: string;
  user_id: string;
  job_id?: string | null;
  name: string;
  target_role: string;
  is_base_resume: boolean;
  has_cover_letter: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A job posting saved by the user for resume tailoring.
 */
export interface Job {
  /** UUID primary key */
  id: string;
  /** Foreign key → auth.users */
  user_id: string;
  company_name: string;
  position_title: string;
  job_url: string | null;
  description: string | null;
  location: string | null;
  salary_range: string | null;
  /** ATS keywords extracted from the job description */
  keywords: string[];
  work_location: 'remote' | 'in_person' | 'hybrid' | null;
  employment_type: 'full_time' | 'part_time' | 'co_op' | 'internship' | 'contract' | null;
  /** Whether this job is still being actively targeted */
  is_active: boolean;
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

/**
 * Stripe-backed subscription record associated with a user.
 */
export interface Subscription {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_plan: 'free' | 'pro';
  subscription_status: 'active' | 'canceled';
  /** ISO 8601 timestamp — when the current billing period ends */
  current_period_end: string | null;
  /** ISO 8601 timestamp — when a trial period ends */
  trial_end: string | null;
  /** ISO 8601 timestamp */
  created_at: string;
  /** ISO 8601 timestamp */
  updated_at: string;
}

// ---------------------------------------------------------------------------
// AI / provider types
// ---------------------------------------------------------------------------

/**
 * Supported AI provider identifiers.
 * This is the canonical definition — all services and the Next.js app should
 * reference this package rather than maintaining their own copy.
 */
export type ServiceName = 'openai' | 'anthropic' | 'openrouter';

/** Runtime map of provider IDs to their display names */
export const AI_PROVIDER_NAMES: Record<ServiceName, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
} as const;

/**
 * Configuration for a single AI provider exposed through the API gateway.
 */
export interface AIProvider {
  /** Matches a `ServiceName` value */
  id: ServiceName;
  name: string;
  /** URL where users can obtain an API key */
  apiLink: string;
  /** Path to a logo asset served by the Next.js public directory */
  logo?: string;
  /** Name of the environment variable that holds the server-side key */
  envKey: string;
  /** Vercel AI SDK initialiser identifier */
  sdkInitializer: string;
  /** Whether this integration is considered experimental */
  unstable?: boolean;
}

/**
 * Availability and feature flags for a specific AI model.
 */
export interface AIModel {
  /** Provider-specific model identifier, e.g. "gpt-4o" */
  id: string;
  /** Human-readable display name */
  name: string;
  provider: ServiceName;
  features: {
    isFree?: boolean;
    isRecommended?: boolean;
    isUnstable?: boolean;
    maxTokens?: number;
    supportsVision?: boolean;
    supportsTools?: boolean;
    /** Requires a paid ResumeLM subscription */
    isPro?: boolean;
  };
  availability: {
    /** `true` when the user must supply their own key */
    requiresApiKey: boolean;
    requiresPro: boolean;
  };
}

/**
 * A user-supplied API key for a specific provider, stored in user settings.
 */
export interface ApiKey {
  service: ServiceName;
  /** Opaque secret — never logged or returned in list responses */
  key: string;
  /** ISO 8601 timestamp when the key was added */
  addedAt: string;
}

/**
 * Per-user AI configuration persisted in their profile / session.
 */
export interface AIConfig {
  /** Active model ID, e.g. "claude-3-5-sonnet-20241022" */
  model: string;
  apiKeys: ApiKey[];
  customPrompts?: CustomPrompts;
}

/**
 * Optional per-operation system-prompt overrides stored in the user's
 * AI configuration.
 */
export interface CustomPrompts {
  aiAssistant?: string;
  workExperienceGenerator?: string;
  workExperienceImprover?: string;
  projectGenerator?: string;
  projectImprover?: string;
  textAnalyzer?: string;
  resumeFormatter?: string;
}

// ---------------------------------------------------------------------------
// Utility / pagination types
// ---------------------------------------------------------------------------

/** Standard paginated list wrapper returned by collection endpoints */
export interface PaginatedList<T> {
  data: T[];
  /** Total number of records matching the query (before pagination) */
  total: number;
  page: number;
  limit: number;
  /** `true` when there are more pages after this one */
  hasNextPage: boolean;
}

/** Generic field-level sort descriptor */
export interface SortDescriptor<T extends string = string> {
  column: T;
  direction: 'ascending' | 'descending';
}

/** Standard inter-service event envelope */
export interface ServiceEvent<T = unknown> {
  /** Unique event ID (UUID) */
  id: string;
  /** Dot-separated event name, e.g. "resume.created" */
  type: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** ID of the user who triggered the event */
  userId: string;
  payload: T;
}
