export const UPLOAD_STATUS = {
  PENDING: "PENDING", // Uploaded, waiting for worker
  PROCESSING: "PROCESSING", // Worker is parsing rows
  COMPLETED: "COMPLETED", // Parsed successfully, ready for reconciliation
  FAILED: "FAILED", // Total failure (e.g., wrong file type, missing headers)
  HAS_ERRORS: "HAS_ERRORS", // Parsed, but some rows had invalid data
} as const;

export type UploadStatus = (typeof UPLOAD_STATUS)[keyof typeof UPLOAD_STATUS];
