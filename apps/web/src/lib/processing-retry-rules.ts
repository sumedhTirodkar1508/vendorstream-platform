import type {
  CycleStatus,
  ImportBatchStatus,
  StatementTaskStatus,
} from "@vendorstream/database";

export const RETRYABLE_IMPORT_BATCH_STATUSES: ImportBatchStatus[] = [
  "PREVALIDATION_FAILED",
  "VALIDATION_FAILED",
  "FAILED",
];

export const RETRYABLE_CYCLE_STATUSES: CycleStatus[] = [
  "READY_FOR_RECONCILIATION",
  "FAILED",
];

export const RECONCILABLE_CURRENT_BATCH_STATUSES: ImportBatchStatus[] = [
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
  "RECONCILED",
];

export const RETRYABLE_STATEMENT_TASK_STATUSES: StatementTaskStatus[] = [
  "FAILED",
  "CANCELED",
];

export function canRetryImportBatch(status: ImportBatchStatus) {
  return RETRYABLE_IMPORT_BATCH_STATUSES.includes(status);
}

export function canRetryCycle(status: CycleStatus) {
  return RETRYABLE_CYCLE_STATUSES.includes(status);
}

export function canRetryStatementTask(status: StatementTaskStatus) {
  return RETRYABLE_STATEMENT_TASK_STATUSES.includes(status);
}
