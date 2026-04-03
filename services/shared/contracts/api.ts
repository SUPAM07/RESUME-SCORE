/**
 * @module @resume-lm/shared/contracts/api
 *
 * API request / response contracts for all ResumeLM microservices.
 *
 * Convention:
 *  - `*Request`  — shape of the HTTP request body or query parameters.
 *  - `*Response` — shape of the JSON body returned by the endpoint.
 *  - `ApiResponse<T>` — the standard envelope that wraps every response.
 *
 * Every service MUST wrap its response body in `ApiResponse<T>` so that
 * clients have a single error-checking code path.
 */

import type {
  AIConfig,
  AIModel,
  Job,
  PaginatedList,
  Profile,
  Resume,
  ResumeSummary,
  ServiceName,
  Subscription,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Shared envelope
// ---------------------------------------------------------------------------

/**
 * Standard JSON envelope returned by every service endpoint.
 *
 * On success: `{ success: true, data: T, requestId: string }`
 * On failure: `{ success: false, error: ApiError, requestId: string }`
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  /** UUID echoed from the `X-Request-ID` header, or generated server-side */
  requestId: string;
}

/** Structured error payload included when `success` is `false` */
export interface ApiError {
  /** Machine-readable error code, e.g. "NOT_FOUND" or "VALIDATION_ERROR" */
  code: string;
  /** Human-readable description safe to show in a UI */
  message: string;
  /** Optional field-level validation details */
  details?: Record<string, string[]>;
  /** HTTP status code mirrored in the body for proxy / logging convenience */
  statusCode: number;
}

// ---------------------------------------------------------------------------
// Auth Service  (POST /auth/*)
// ---------------------------------------------------------------------------

/** POST /auth/verify — validate a JWT and return decoded user claims */
export interface VerifyTokenRequest {
  token: string;
}

export interface VerifyTokenResponse {
  userId: string;
  email: string;
  /** ISO 8601 expiry timestamp */
  expiresAt: string;
  subscriptionPlan: 'free' | 'pro';
}

/** POST /auth/refresh — exchange a refresh token for new access + refresh tokens */
export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the new access token expires */
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Profile Service  (GET|PUT /profiles/*)
// ---------------------------------------------------------------------------

/** PUT /profiles/:userId — full or partial profile update */
export type UpdateProfileRequest = Partial<
  Pick<
    Profile,
    | 'first_name'
    | 'last_name'
    | 'email'
    | 'phone_number'
    | 'location'
    | 'website'
    | 'linkedin_url'
    | 'github_url'
    | 'work_experience'
    | 'education'
    | 'skills'
    | 'projects'
  >
>;

/** GET /profiles/:userId */
export type GetProfileResponse = Profile;

/** PUT /profiles/:userId */
export type UpdateProfileResponse = Profile;

// ---------------------------------------------------------------------------
// Resume Service  (GET|POST|PUT|DELETE /resumes/*)
// ---------------------------------------------------------------------------

/** POST /resumes — create a new resume (base or tailored) */
export interface CreateResumeRequest {
  name: string;
  target_role: string;
  is_base_resume: boolean;
  /** Required when `is_base_resume` is `false` */
  job_id?: string;
  /** Seed the resume from an existing profile; defaults to the caller's profile */
  source_profile_id?: string;
}

/** PUT /resumes/:resumeId — full or partial resume update */
export type UpdateResumeRequest = Partial<
  Omit<Resume, 'id' | 'user_id' | 'created_at' | 'updated_at'>
>;

/** GET /resumes — list resumes for the authenticated user */
export interface ListResumesRequest {
  /** Filter by resume type */
  is_base_resume?: boolean;
  /** Filter by linked job */
  job_id?: string;
  page?: number;
  limit?: number;
}

/** GET /resumes */
export type ListResumesResponse = PaginatedList<ResumeSummary>;

/** GET /resumes/:resumeId */
export type GetResumeResponse = Resume;

/** POST /resumes */
export type CreateResumeResponse = Resume;

/** PUT /resumes/:resumeId */
export type UpdateResumeResponse = Resume;

/** DELETE /resumes/:resumeId */
export interface DeleteResumeResponse {
  deleted: boolean;
  id: string;
}

// ---------------------------------------------------------------------------
// Job Service  (GET|POST|PUT|DELETE /jobs/*)
// ---------------------------------------------------------------------------

/** POST /jobs — save a new job posting */
export interface CreateJobRequest {
  company_name: string;
  position_title: string;
  job_url?: string;
  description?: string;
  location?: string;
  salary_range?: string;
  keywords?: string[];
  work_location?: Job['work_location'];
  employment_type?: Job['employment_type'];
}

/** PUT /jobs/:jobId — update an existing job posting */
export type UpdateJobRequest = Partial<Omit<CreateJobRequest, never>> & {
  is_active?: boolean;
};

/** GET /jobs — list jobs for the authenticated user */
export interface ListJobsRequest {
  is_active?: boolean;
  page?: number;
  limit?: number;
}

/** GET /jobs */
export type ListJobsResponse = PaginatedList<Job>;

/** GET /jobs/:jobId */
export type GetJobResponse = Job;

/** POST /jobs */
export type CreateJobResponse = Job;

/** PUT /jobs/:jobId */
export type UpdateJobResponse = Job;

/** DELETE /jobs/:jobId */
export interface DeleteJobResponse {
  deleted: boolean;
  id: string;
}

// ---------------------------------------------------------------------------
// AI Service  (POST /ai/*)
// ---------------------------------------------------------------------------

/**
 * POST /ai/chat — single-turn chat completion used by the AI assistant.
 * Returns a streaming `text/event-stream` response.
 */
export interface AIChatRequest {
  /** The AI model to use, e.g. "claude-3-5-sonnet-20241022" */
  model: string;
  messages: AIChatMessage[];
  /** ID of the resume context to attach */
  resumeId?: string;
  /** ID of the job context to attach */
  jobId?: string;
  /** System-prompt override for this request */
  systemPrompt?: string;
  /** Sampling temperature (0–1) */
  temperature?: number;
  /** Hard cap on generated tokens */
  maxTokens?: number;
}

export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Non-streaming response envelope for /ai/chat */
export interface AIChatResponse {
  content: string;
  /** Provider-reported token usage */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** The model that ultimately served the request */
  model: string;
}

/**
 * POST /ai/optimize — ask the AI to improve a specific resume section.
 */
export interface AIOptimizeRequest {
  resumeId: string;
  /** Which section to rewrite, e.g. "work_experience" | "projects" */
  section: string;
  /** 0-based index of the item within the section to optimise */
  itemIndex?: number;
  jobId?: string;
  model: string;
  /** Caller-supplied instruction, e.g. "Make it more concise" */
  instruction?: string;
}

export interface AIOptimizeResponse {
  /** The rewritten section content */
  result: unknown;
  /** Explanation of changes made */
  explanation?: string;
  model: string;
}

/**
 * POST /ai/analyze — score a resume against a job description.
 */
export interface AIAnalyzeRequest {
  resumeId: string;
  jobId: string;
  model: string;
}

export interface AIAnalyzeResponse {
  /** Overall ATS match score (0–100) */
  score: number;
  /** Keywords present in the job description but missing from the resume */
  missingKeywords: string[];
  /** Keyword matches found in the resume */
  matchedKeywords: string[];
  /** Section-level feedback */
  feedback: AIAnalysisFeedback[];
  model: string;
}

export interface AIAnalysisFeedback {
  section: string;
  score: number;
  suggestions: string[];
}

/**
 * POST /ai/models — list models available to the caller.
 */
export interface ListAIModelsRequest {
  provider?: ServiceName;
  /** Only return models usable without a user-supplied key */
  freeOnly?: boolean;
}

export interface ListAIModelsResponse {
  models: AIModel[];
}

/**
 * GET /ai/config — retrieve the caller's AI configuration.
 * PUT /ai/config — update the caller's AI configuration.
 */
export type GetAIConfigResponse = AIConfig;
export type UpdateAIConfigRequest = Partial<AIConfig>;
export type UpdateAIConfigResponse = AIConfig;

/**
 * POST /ai/config/keys — add or rotate a provider API key.
 * DELETE /ai/config/keys/:service — remove a provider API key.
 */
export interface UpsertApiKeyRequest {
  service: ServiceName;
  key: string;
}

export interface UpsertApiKeyResponse {
  service: ServiceName;
  /** ISO 8601 timestamp */
  addedAt: string;
}

export interface DeleteApiKeyResponse {
  service: ServiceName;
  deleted: boolean;
}

// ---------------------------------------------------------------------------
// Subscription Service  (GET|POST /subscriptions/*)
// ---------------------------------------------------------------------------

/** GET /subscriptions/me */
export type GetSubscriptionResponse = Subscription;

/**
 * POST /subscriptions/checkout — create a Stripe Checkout Session.
 * Returns a URL the client should redirect to.
 */
export interface CreateCheckoutSessionRequest {
  plan: 'pro';
  /** URL Stripe redirects to on success */
  successUrl: string;
  /** URL Stripe redirects to on cancel */
  cancelUrl: string;
}

export interface CreateCheckoutSessionResponse {
  /** Stripe-hosted checkout URL */
  checkoutUrl: string;
  /** Stripe Session ID */
  sessionId: string;
}

/**
 * POST /subscriptions/portal — create a Stripe Customer Portal Session
 * so users can manage / cancel their subscription.
 */
export interface CreatePortalSessionRequest {
  returnUrl: string;
}

export interface CreatePortalSessionResponse {
  portalUrl: string;
}

/**
 * POST /subscriptions/webhook — raw Stripe webhook payload.
 * The service validates the `Stripe-Signature` header before processing.
 * The request body is the raw bytes from Stripe; no typed contract is needed.
 */
export interface WebhookHandledResponse {
  received: boolean;
}

// ---------------------------------------------------------------------------
// API Gateway  (health + meta)
// ---------------------------------------------------------------------------

/** GET /health */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Service name and version */
  service: string;
  version: string;
  /** Per-dependency liveness */
  dependencies?: Record<string, 'ok' | 'degraded' | 'down'>;
}
