import { z } from 'zod';

// ─── User Types ─────────────────────────────────────────────────────────────

export const UserRoleSchema = z.enum(['FREE', 'PRO', 'ENTERPRISE', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Resume Types ────────────────────────────────────────────────────────────

export const ResumeStatusSchema = z.enum([
  'DRAFT',
  'PROCESSING',
  'ANALYZED',
  'ERROR',
  'ARCHIVED',
]);
export type ResumeStatus = z.infer<typeof ResumeStatusSchema>;

export interface ResumeSection {
  type: 'SUMMARY' | 'EXPERIENCE' | 'EDUCATION' | 'SKILLS' | 'PROJECTS' | 'CERTIFICATIONS' | 'CUSTOM';
  title?: string;
  content: string;
  order: number;
}

export interface Resume {
  id: string;
  userId: string;
  title: string;
  originalFileName?: string;
  status: ResumeStatus;
  sections: ResumeSection[];
  rawText?: string;
  fileUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── AI / Scoring Types ──────────────────────────────────────────────────────

export interface ScoreBreakdown {
  overall: number;           // 0–100
  keywordMatch: number;
  experienceMatch: number;
  skillsMatch: number;
  formattingScore: number;
  readabilityScore: number;
  atsFriendliness: number;
}

export interface AIAnalysisResult {
  resumeId: string;
  jobId?: string;
  scores: ScoreBreakdown;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  keywordsFound: string[];
  keywordsMissing: string[];
  summary: string;
  analyzedAt: string;
  modelUsed: string;
}

export interface AIParsingResult {
  resumeId: string;
  parsedSections: ResumeSection[];
  extractedSkills: string[];
  extractedExperience: ExperienceItem[];
  extractedEducation: EducationItem[];
  confidence: number;
  parsedAt: string;
}

export interface ExperienceItem {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
  description: string;
  skills: string[];
}

export interface EducationItem {
  institution: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  gpa?: number;
}

// ─── Job Types ───────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  userId: string;
  title: string;
  company: string;
  description: string;
  requirements: string[];
  skills: string[];
  experienceLevel: 'ENTRY' | 'MID' | 'SENIOR' | 'LEAD' | 'EXECUTIVE';
  location?: string;
  remote: boolean;
  salary?: { min?: number; max?: number; currency: string };
  createdAt: string;
  updatedAt: string;
}

// ─── Notification Types ──────────────────────────────────────────────────────

export type NotificationChannel = 'EMAIL' | 'PUSH' | 'WEBSOCKET' | 'SMS';
export type NotificationType =
  | 'RESUME_ANALYSIS_COMPLETE'
  | 'RESUME_SCORING_COMPLETE'
  | 'JOB_MATCH_FOUND'
  | 'ACCOUNT_ACTIVITY'
  | 'SYSTEM_ALERT';

export interface NotificationPayload {
  userId: string;
  channels: NotificationChannel[];
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

// ─── API Response Types ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    requestId?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
