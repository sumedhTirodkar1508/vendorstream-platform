export const JOBS = {
  PROCESS_IMPORT_BATCH: "process-import-batch",
  RECONCILE_CYCLE: "reconcile-cycle",
  GENERATE_STATEMENT: "generate-statement",
  CLEANUP_FAILED_UPLOAD_ARTIFACTS: "cleanup-failed-upload-artifacts",
  RETRY_FAILED_BATCH: "retry-failed-batch",
  SEND_REMINDER: "send-reminder",
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
