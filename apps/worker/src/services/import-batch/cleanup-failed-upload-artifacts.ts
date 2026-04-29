import type { SupabaseStorageAdapter } from "../../adapters/supabase-storage.js";
import { logger } from "../../logger.js";
import { ImportBatchRepository } from "../../repositories/import-batch-repository.js";

const FAILED_UPLOAD_RETENTION_MONTHS = 6;
const CLEANUP_BATCH_SIZE = 100;

type CleanupFailedUploadArtifactsDependencies = {
  repository: ImportBatchRepository;
  storageAdapter: SupabaseStorageAdapter;
};

export type CleanupFailedUploadArtifactsOutcome = {
  scannedCount: number;
  cleanedCount: number;
  failedCount: number;
};

function getRetentionCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - FAILED_UPLOAD_RETENTION_MONTHS);
  return cutoff;
}

export async function cleanupFailedUploadArtifacts(
  dependencies: CleanupFailedUploadArtifactsDependencies,
): Promise<CleanupFailedUploadArtifactsOutcome> {
  const { repository, storageAdapter } = dependencies;
  const cutoff = getRetentionCutoff();
  const batches = await repository.findFailedLpBatchesForRetentionCleanup({
    cutoff,
    take: CLEANUP_BATCH_SIZE,
  });
  let cleanedCount = 0;
  let failedCount = 0;

  for (const batch of batches) {
    try {
      if (!batch.uploadedFile.deletedAt) {
        await storageAdapter.deleteObject(
          batch.uploadedFile.bucket,
          batch.uploadedFile.storagePath,
        );
      }

      await repository.markFailedLpBatchArtifactsCleaned({
        importBatchId: batch.id,
        uploadedFileId: batch.uploadedFileId,
        deletedAt: new Date(),
      });

      cleanedCount += 1;
    } catch (error) {
      failedCount += 1;
      logger.error(
        {
          err: error,
          importBatchId: batch.id,
          uploadedFileId: batch.uploadedFileId,
        },
        "Failed to clean retained LP upload artifacts",
      );
    }
  }

  return {
    scannedCount: batches.length,
    cleanedCount,
    failedCount,
  };
}
