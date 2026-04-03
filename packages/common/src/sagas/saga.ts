/**
 * @module infrastructure/sagas
 *
 * Saga orchestration helpers for distributed transactions in ResumeLM.
 *
 * A Saga is a sequence of local transactions.  If any step fails, previously
 * completed steps are compensated (rolled back) in reverse order.
 *
 * ## Pattern
 * ```
 * Step 1: createResume()      ← compensation: deleteResume()
 * Step 2: queueAiScoring()    ← compensation: cancelAiTask()
 * Step 3: publishResumeEvent()← compensation: (idempotent — no-op)
 *
 * If Step 2 fails → run compensation for Step 1
 * ```
 *
 * ## Usage
 * ```ts
 * import { Saga, SagaStep } from './saga';
 *
 * const steps: SagaStep[] = [
 *   {
 *     name: 'create-resume',
 *     execute: async () => { const id = await resumeService.create(data); return { resumeId: id }; },
 *     compensate: async (ctx) => { await resumeService.delete(ctx.resumeId); },
 *   },
 *   {
 *     name: 'queue-ai-scoring',
 *     execute: async (ctx) => { await aiService.queueScore(ctx.resumeId); },
 *     compensate: async (ctx) => { await aiService.cancel(ctx.taskId); },
 *   },
 * ];
 *
 * const saga = new Saga('create-resume-saga', steps);
 * const result = await saga.execute();
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shared state passed between steps and available to compensation handlers. */
export type SagaContext = Record<string, unknown>;

export interface SagaStep {
  /** Human-readable step name used in logs and error messages. */
  name: string;
  /**
   * Execute the step.  May return partial state to merge into the saga context.
   * If this throws, compensation runs for all previously completed steps.
   */
  execute(context: SagaContext): Promise<SagaContext | void>;
  /**
   * Undo the step.  Called when a later step fails.
   * Should be idempotent — it may be called more than once.
   */
  compensate(context: SagaContext): Promise<void>;
}

export interface SagaResult {
  success: boolean;
  context: SagaContext;
  failedStep?: string;
  error?: unknown;
  compensationErrors: Array<{ step: string; error: unknown }>;
}

// ---------------------------------------------------------------------------
// Saga executor
// ---------------------------------------------------------------------------

/**
 * Orchestrating saga executor.
 *
 * - Executes steps sequentially.
 * - On failure, runs compensations for completed steps in reverse order.
 * - Returns a `SagaResult` regardless of success or failure — never throws.
 */
export class Saga {
  constructor(
    readonly name: string,
    private readonly steps: SagaStep[],
  ) {}

  async execute(initialContext: SagaContext = {}): Promise<SagaResult> {
    const context: SagaContext = { ...initialContext };
    const completed: SagaStep[] = [];
    const compensationErrors: Array<{ step: string; error: unknown }> = [];

    for (const step of this.steps) {
      try {
        const result = await step.execute(context);
        if (result) {
          Object.assign(context, result);
        }
        completed.push(step);
      } catch (err) {
        // Step failed — compensate completed steps in reverse order
        for (const completedStep of [...completed].reverse()) {
          try {
            await completedStep.compensate(context);
          } catch (compErr) {
            compensationErrors.push({ step: completedStep.name, error: compErr });
          }
        }

        return {
          success: false,
          context,
          failedStep: step.name,
          error: err,
          compensationErrors,
        };
      }
    }

    return { success: true, context, compensationErrors };
  }
}

// ---------------------------------------------------------------------------
// Pre-built saga steps for common ResumeLM workflows
// ---------------------------------------------------------------------------

/**
 * Factory helpers that create strongly-typed saga steps for common operations.
 * Services pass in the actual service clients so the saga remains decoupled.
 */

export interface CreateResumeAndScoreSagaInput {
  userId: string;
  resumeData: unknown;
  jobId?: string;
  createResume: (data: unknown, userId: string) => Promise<string>;
  deleteResume: (resumeId: string) => Promise<void>;
  queueAiScore: (resumeId: string, jobId?: string) => Promise<string>;
  cancelAiTask: (taskId: string) => Promise<void>;
}

/**
 * Build a 2-step saga: create resume → queue AI scoring.
 * If AI queuing fails the resume is deleted (compensation).
 */
export function buildCreateAndScoreSaga(
  input: CreateResumeAndScoreSagaInput,
): Saga {
  const steps: SagaStep[] = [
    {
      name: 'create-resume',
      async execute(_ctx) {
        const resumeId = await input.createResume(input.resumeData, input.userId);
        return { resumeId };
      },
      async compensate(ctx) {
        if (ctx['resumeId']) {
          await input.deleteResume(ctx['resumeId'] as string);
        }
      },
    },
    {
      name: 'queue-ai-scoring',
      async execute(ctx) {
        const taskId = await input.queueAiScore(
          ctx['resumeId'] as string,
          input.jobId,
        );
        return { taskId };
      },
      async compensate(ctx) {
        if (ctx['taskId']) {
          await input.cancelAiTask(ctx['taskId'] as string).catch(() => {
            // Best-effort cancellation
          });
        }
      },
    },
  ];

  return new Saga('create-resume-and-score', steps);
}
