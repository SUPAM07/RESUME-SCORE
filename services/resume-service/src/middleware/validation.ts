import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/** Reusable optional URL field: accepts a valid URL string or empty string */
export const optionalUrl = z.union([z.string().url(), z.literal('')]).optional();

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export const createResumeSchema = z.object({
  name: z.string().min(1).max(255),
  is_base_resume: z.boolean().optional().default(false),
  job_id: z.string().uuid().optional(),
  personal_info: z
    .object({
      full_name: z.string().min(1),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      location: z.string().optional(),
      linkedin: optionalUrl,
      github: optionalUrl,
      website: optionalUrl,
    })
    .optional(),
  summary: z.string().optional(),
  work_experience: z
    .array(
      z.object({
        position: z.string().min(1),
        company: z.string().min(1),
        location: z.string().optional(),
        start_date: z.string(),
        end_date: z.string().optional(),
        description: z.string().optional(),
        responsibilities: z.array(z.string()).default([]),
      })
    )
    .optional()
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string().min(1),
        institution: z.string().min(1),
        location: z.string().optional(),
        graduation_date: z.string(),
        gpa: z.string().optional(),
        achievements: z.array(z.string()).optional().default([]),
      })
    )
    .optional()
    .default([]),
  skills: z
    .array(
      z.object({
        category: z.string().min(1),
        skills: z.array(z.string()).min(1),
      })
    )
    .optional()
    .default([]),
});

export const updateResumeSchema = createResumeSchema.partial();

