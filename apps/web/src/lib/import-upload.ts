import type {
  BatchSourceType,
  CycleStatus,
  FileKind,
} from "@vendorstream/database";

export const ACCEPTED_IMPORT_UPLOAD_FILE_EXTENSIONS = [
  ".xlsx",
  ".xls",
  ".xlsm",
] as const;

export const ACCEPTED_IMPORT_UPLOAD_MIME_TYPES = [
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
] as const;

export const MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const DEFAULT_IMPORT_UPLOAD_BUCKET =
  process.env.SUPABASE_STORAGE_IMPORTS_BUCKET?.trim() || "raw-imports";

export type UploadSourceType = BatchSourceType;

export type CreateImportUploadIntentRequest = {
  sourceType: UploadSourceType;
  lpId: string;
  storeLocationId: string;
  month: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string | null;
};

export type CreateImportUploadIntentSuccess = {
  ok: true;
  bucket: string;
  storagePath: string;
  signedUrl: string;
  signedUploadToken: string;
  uploadIntentToken: string;
  expiresAt: string;
  sourceType: UploadSourceType;
  fileName: string;
  month: string;
  lpId: string;
  storeLocationId: string;
};

export type CreateImportUploadIntentError = {
  ok: false;
  error: string;
};

export type FinalizeImportUploadRequest = {
  uploadIntentToken: string;
};

export type FinalizeImportUploadSuccess = {
  ok: true;
  message: string;
  uploadedFileId: string;
  importBatchId: string;
  cycleId: string;
  cycleStatus: CycleStatus;
  sourceType: UploadSourceType;
  bucket: string;
  storagePath: string;
  processingState: "RECEIVED";
  wasExisting: boolean;
  queue: {
    jobName: string;
    status: "ENQUEUED" | "FAILED" | "SKIPPED";
    jobId: string | null;
    error: string | null;
  };
};

export type FinalizeImportUploadError = {
  ok: false;
  error: string;
};

export function isValidUploadMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

export function parseUploadMonth(value: string) {
  const [year, month] = value.split("-").map((part) => Number(part));

  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

export function isAcceptedImportUploadFileName(value: string) {
  const lowerValue = value.toLowerCase();

  return ACCEPTED_IMPORT_UPLOAD_FILE_EXTENSIONS.some((extension) =>
    lowerValue.endsWith(extension),
  );
}

export function isAcceptedImportUploadMimeType(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  return ACCEPTED_IMPORT_UPLOAD_MIME_TYPES.includes(
    value as (typeof ACCEPTED_IMPORT_UPLOAD_MIME_TYPES)[number],
  );
}

export function sanitizeStorageSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildImportUploadStoragePath(input: {
  sourceType: UploadSourceType;
  lpId: string;
  storeLocationId: string;
  month: string;
  fileName: string;
  uniqueSuffix: string;
}) {
  const safeFileName = sanitizeStorageSegment(input.fileName) || "upload.xlsx";
  const sourceSegment = input.sourceType === "LP" ? "lp" : "store";

  return [
    "imports",
    sourceSegment,
    sanitizeStorageSegment(input.lpId),
    sanitizeStorageSegment(input.storeLocationId),
    sanitizeStorageSegment(input.month),
    `${sanitizeStorageSegment(input.uniqueSuffix)}-${safeFileName}`,
  ].join("/");
}

export function getFileKindForSourceType(sourceType: UploadSourceType): FileKind {
  return sourceType === "LP" ? "LP_UPLOAD" : "STORE_UPLOAD";
}

export function getCycleStatusForCurrentBatchPresence(input: {
  hasCurrentLpBatch: boolean;
  hasCurrentStoreBatch: boolean;
}): CycleStatus {
  return input.hasCurrentLpBatch && input.hasCurrentStoreBatch
    ? "READY_FOR_RECONCILIATION"
    : "AWAITING_UPLOADS";
}
