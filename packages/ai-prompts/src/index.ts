import Handlebars from 'handlebars';

// ─── Base Prompt Builder ──────────────────────────────────────────────────────

export interface PromptTemplate<T = Record<string, unknown>> {
  name: string;
  version: string;
  template: string;
  render(context: T): string;
}

function createPrompt<T>(name: string, version: string, templateStr: string): PromptTemplate<T> {
  const compiled = Handlebars.compile(templateStr, { noEscape: true });
  return {
    name,
    version,
    template: templateStr,
    render: (context: T) => compiled(context),
  };
}

// ─── Resume Analysis Prompt ───────────────────────────────────────────────────

export interface ResumeAnalysisContext {
  resumeText: string;
  jobDescription?: string;
  targetRole?: string;
  targetIndustry?: string;
}

export const resumeAnalysisPrompt = createPrompt<ResumeAnalysisContext>(
  'resume-analysis',
  '1.0.0',
  `You are an expert resume coach and ATS (Applicant Tracking System) specialist.

Analyze the following resume{{#if jobDescription}} against the provided job description{{/if}}.

## Resume Content:
{{{resumeText}}}

{{#if jobDescription}}
## Job Description:
{{{jobDescription}}}
{{/if}}

{{#if targetRole}}Target Role: {{targetRole}}{{/if}}
{{#if targetIndustry}}Target Industry: {{targetIndustry}}{{/if}}

Provide a comprehensive analysis with:
1. **Overall Score** (0-100): Weighted composite score
2. **Section Scores**: keyword_match, experience_match, skills_match, formatting, readability, ats_friendliness (each 0-100)
3. **Strengths**: List of top 3-5 strengths
4. **Weaknesses**: List of top 3-5 areas needing improvement  
5. **Actionable Suggestions**: Specific, implementable improvements
6. **Keywords Found**: Keywords present in both resume and job description
7. **Keywords Missing**: Important keywords absent from resume
8. **Summary**: 2-3 sentence executive summary

Respond ONLY with valid JSON matching this schema:
{
  "scores": { "overall": number, "keywordMatch": number, "experienceMatch": number, "skillsMatch": number, "formattingScore": number, "readabilityScore": number, "atsFriendliness": number },
  "strengths": string[],
  "weaknesses": string[],
  "suggestions": string[],
  "keywordsFound": string[],
  "keywordsMissing": string[],
  "summary": string
}`,
);

// ─── Resume Scoring Prompt ────────────────────────────────────────────────────

export interface ResumeScoringContext {
  resumeText: string;
  jobTitle: string;
  jobDescription: string;
  requiredSkills: string[];
  niceToHaveSkills?: string[];
  experienceLevel: string;
}

export const resumeScoringPrompt = createPrompt<ResumeScoringContext>(
  'resume-scoring',
  '1.0.0',
  `You are an expert technical recruiter with deep expertise in ATS optimization.

Score and rank this resume for the {{jobTitle}} position.

## Resume:
{{{resumeText}}}

## Job Requirements:
**Job Description:** {{{jobDescription}}}
**Required Skills:** {{#each requiredSkills}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{#if niceToHaveSkills}}**Nice to Have:** {{#each niceToHaveSkills}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}{{/if}}
**Experience Level Required:** {{experienceLevel}}

Provide a strict, honest assessment. Return ONLY valid JSON:
{
  "score": number,
  "qualified": boolean,
  "matchPercentage": number,
  "matchedRequirements": string[],
  "missingRequirements": string[],
  "recommendation": "STRONG_YES" | "YES" | "MAYBE" | "NO",
  "feedback": string
}`,
);

// ─── Job Description Analysis Prompt ─────────────────────────────────────────

export interface JobAnalysisContext {
  jobDescription: string;
  companyName?: string;
}

export const jobAnalysisPrompt = createPrompt<JobAnalysisContext>(
  'job-analysis',
  '1.0.0',
  `Extract structured data from this job description.

{{#if companyName}}Company: {{companyName}}{{/if}}

## Job Description:
{{{jobDescription}}}

Return ONLY valid JSON:
{
  "title": string,
  "requiredSkills": string[],
  "preferredSkills": string[],
  "experienceLevel": "ENTRY" | "MID" | "SENIOR" | "LEAD" | "EXECUTIVE",
  "experienceYears": { "min": number, "max": number } | null,
  "educationRequired": string | null,
  "keyResponsibilities": string[],
  "keywords": string[],
  "remote": boolean,
  "salary": { "min": number, "max": number, "currency": string } | null
}`,
);

// ─── Resume Improvement Prompt ────────────────────────────────────────────────

export interface ResumeImprovementContext {
  resumeSection: string;
  sectionType: string;
  targetRole: string;
  weaknesses: string[];
}

export const resumeImprovementPrompt = createPrompt<ResumeImprovementContext>(
  'resume-improvement',
  '1.0.0',
  `You are a professional resume writer. Rewrite and improve this resume {{sectionType}} section.

## Current Content:
{{{resumeSection}}}

## Target Role: {{targetRole}}

## Issues to Address:
{{#each weaknesses}}- {{this}}
{{/each}}

Rules:
- Use strong action verbs
- Add quantifiable achievements where possible
- Optimize for ATS keywords
- Be concise and impactful
- Do NOT fabricate information

Return plain text of the improved section only.`,
);

// ─── Export all prompts ───────────────────────────────────────────────────────

export const PROMPTS = {
  resumeAnalysis: resumeAnalysisPrompt,
  resumeScoring: resumeScoringPrompt,
  jobAnalysis: jobAnalysisPrompt,
  resumeImprovement: resumeImprovementPrompt,
} as const;
