/**
 * Canonical Kafka topic names for the Resume Score platform.
 * These MUST match the topics defined in infra/kafka/topics.json.
 */
export const KAFKA_TOPICS = {
  // User domain
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',

  // Resume domain
  RESUME_UPLOADED: 'resume.uploaded',
  RESUME_UPDATED: 'resume.updated',
  RESUME_DELETED: 'resume.deleted',
  RESUME_ANALYZED: 'resume.analyzed',

  // AI domain
  AI_ANALYSIS_REQUESTED: 'ai.analysis.requested',
  AI_ANALYSIS_COMPLETED: 'ai.analysis.completed',
  AI_SCORING_REQUESTED: 'ai.scoring.requested',
  AI_SCORING_COMPLETED: 'ai.scoring.completed',
  AI_PARSING_REQUESTED: 'ai.parsing.requested',
  AI_PARSING_COMPLETED: 'ai.parsing.completed',

  // Job domain
  JOB_CREATED: 'job.created',
  JOB_ANALYSIS_REQUESTED: 'job.analysis.requested',
  JOB_MATCH_COMPLETED: 'job.match.completed',

  // Notifications
  NOTIFICATION_REQUESTED: 'notification.requested',
  NOTIFICATION_SENT: 'notification.sent',

  // System
  DEAD_LETTER: 'system.dead-letter',
  AUDIT_LOG: 'system.audit-log',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
