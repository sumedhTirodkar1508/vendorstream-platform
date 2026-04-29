import type {
  ProcessImportBatchPayload,
  ReconcileCyclePayload,
} from "@vendorstream/contracts";

import type { SupabaseStorageAdapter } from "../../adapters/supabase-storage.js";
import { logger } from "../../logger.js";
import {
  ImportBatchRepository,
  type ImportBatchForProcessing,
} from "../../repositories/import-batch-repository.js";
import { parseImportWorkbook } from "./parse-import-workbook.js";

type ProcessImportBatchDependencies = {
  repository: ImportBatchRepository;
  storageAdapter: SupabaseStorageAdapter;
};

type ProcessImportBatchOutcome = {
  reconcileCyclePayload: ReconcileCyclePayload | null;
};

function assertBatchMatchesPayload(
  batch: ImportBatchForProcessing,
  payload: ProcessImportBatchPayload,
): void {
  const mismatches: string[] = [];

  if (batch.id !== payload.importBatchId) {
    mismatches.push("importBatchId");
  }

  if (batch.cycleId !== payload.cycleId) {
    mismatches.push("cycleId");
  }

  if (batch.uploadedFileId !== payload.uploadedFileId) {
    mismatches.push("uploadedFileId");
  }

  if (batch.sourceType !== payload.sourceType) {
    mismatches.push("sourceType");
  }

  if (batch.cycle.lpId !== payload.lpId) {
    mismatches.push("lpId");
  }

  if (batch.cycle.storeLocationId !== payload.storeLocationId) {
    mismatches.push("storeLocationId");
  }

  const cycleMonth = batch.cycle.periodMonth.toISOString().slice(0, 7);
  if (cycleMonth !== payload.periodMonth) {
    mismatches.push("periodMonth");
  }

  if (mismatches.length > 0) {
    throw new Error(
      `process-import-batch payload does not match database state for fields: ${mismatches.join(", ")}`,
    );
  }
}

function formatCountryForAddress(country: string): string {
  return country.trim().toUpperCase() === "CA" ? "CAN" : country.trim();
}

function buildStoreAddress(
  storeLocation: ImportBatchForProcessing["cycle"]["storeLocation"],
): string {
  return [
    storeLocation.addressLine1,
    storeLocation.addressLine2,
    `${storeLocation.city}, ${storeLocation.province} ${storeLocation.postalCode}`,
    formatCountryForAddress(storeLocation.country),
  ]
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .join("\n");
}

export async function processImportBatch(
  payload: ProcessImportBatchPayload,
  dependencies: ProcessImportBatchDependencies,
): Promise<ProcessImportBatchOutcome> {
  const { repository, storageAdapter } = dependencies;

  const batch = await repository.getImportBatchForProcessing(payload.importBatchId);

  if (!batch) {
    throw new Error(`Import batch ${payload.importBatchId} was not found.`);
  }

  assertBatchMatchesPayload(batch, payload);

  await repository.resetBatchForProcessing(batch.id, batch.cycleId);

  try {
    const fileBuffer = await storageAdapter.downloadObject(
      batch.uploadedFile.bucket,
      batch.uploadedFile.storagePath,
    );

    const parsedWorkbook = await parseImportWorkbook({
      buffer: fileBuffer as unknown as Buffer,
      payload,
      validationContext: {
        lpLegalName: batch.cycle.lp.legalName ?? batch.cycle.lp.name,
        storeLocationName: batch.cycle.storeLocation.name,
        storeAddress: buildStoreAddress(batch.cycle.storeLocation),
      },
    });

    if (parsedWorkbook.kind === "prevalidation-failure") {
      const errorMessage = parsedWorkbook.errors.join(" ");

      if (batch.sourceType === "LP") {
        await repository.markBatchPrevalidationFailed(
          batch.id,
          batch.cycleId,
          errorMessage,
          {
            errors: parsedWorkbook.errors,
            ...parsedWorkbook.details,
          },
          {
            demoteBatch: true,
            updateCycleFailure: false,
          },
        );
        await repository.synchronizeCycleState(batch.cycleId);
      } else {
        await repository.markBatchPrevalidationFailed(
          batch.id,
          batch.cycleId,
          errorMessage,
          {
            errors: parsedWorkbook.errors,
            ...parsedWorkbook.details,
          },
        );
      }

      logger.warn(
        {
          importBatchId: batch.id,
          cycleId: batch.cycleId,
          sourceType: batch.sourceType,
          errors: parsedWorkbook.errors,
        },
        "Import batch failed prevalidation",
      );

      return {
        reconcileCyclePayload: null,
      };
    }

    if (parsedWorkbook.sourceType === "LP" && parsedWorkbook.invalidRowCount > 0) {
      const errorMessage =
        "LP workbook validation failed. Fix the row-level errors and upload the workbook again.";

      await repository.persistLpWorkbookValidationFailure(
        batch.id,
        batch.cycleId,
        parsedWorkbook,
        errorMessage,
      );
      await repository.synchronizeCycleState(batch.cycleId);

      logger.warn(
        {
          importBatchId: batch.id,
          cycleId: batch.cycleId,
          sourceType: batch.sourceType,
          totalRowCount: parsedWorkbook.totalRowCount,
          invalidRowCount: parsedWorkbook.invalidRowCount,
        },
        "LP import batch failed row validation",
      );

      return {
        reconcileCyclePayload: null,
      };
    }

    if (parsedWorkbook.validRowCount === 0) {
      const errorMessage =
        "Workbook parsed successfully but no valid rows were found for staging.";

      if (parsedWorkbook.sourceType === "LP") {
        await repository.persistLpWorkbookValidationFailure(
          batch.id,
          batch.cycleId,
          parsedWorkbook,
          errorMessage,
        );
        await repository.synchronizeCycleState(batch.cycleId);

        logger.warn(
          {
            importBatchId: batch.id,
            cycleId: batch.cycleId,
            sourceType: batch.sourceType,
            totalRowCount: parsedWorkbook.totalRowCount,
            invalidRowCount: parsedWorkbook.invalidRowCount,
          },
          "LP import batch produced zero valid rows",
        );

        return {
          reconcileCyclePayload: null,
        };
      }

      await repository.markBatchValidationFailed(
        batch.id,
        batch.cycleId,
        parsedWorkbook.validationSummary,
        errorMessage,
        {
          totalRowCount: parsedWorkbook.totalRowCount,
          validRowCount: parsedWorkbook.validRowCount,
          invalidRowCount: parsedWorkbook.invalidRowCount,
        },
      );

      logger.warn(
        {
          importBatchId: batch.id,
          cycleId: batch.cycleId,
          sourceType: batch.sourceType,
          totalRowCount: parsedWorkbook.totalRowCount,
          invalidRowCount: parsedWorkbook.invalidRowCount,
        },
        "Import batch produced zero valid rows",
      );

      return {
        reconcileCyclePayload: null,
      };
    }

    if (parsedWorkbook.sourceType === "LP") {
      await repository.persistLpWorkbookResult(
        batch.id,
        batch.cycleId,
        parsedWorkbook,
      );
    } else {
      await repository.persistStoreWorkbookResult(
        batch.id,
        batch.cycleId,
        parsedWorkbook,
      );
    }

    await repository.synchronizeCycleState(batch.cycleId);

    logger.info(
      {
        importBatchId: batch.id,
        cycleId: batch.cycleId,
        sourceType: batch.sourceType,
        totalRowCount: parsedWorkbook.totalRowCount,
        validRowCount: parsedWorkbook.validRowCount,
        invalidRowCount: parsedWorkbook.invalidRowCount,
      },
      "Import batch processed successfully",
    );

    return {
      reconcileCyclePayload: null,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown processing error";

    await repository.markBatchFailed(
      batch.id,
      batch.cycleId,
      errorMessage,
      {
        sourceType: batch.sourceType,
      },
      batch.sourceType === "LP"
        ? {
            demoteBatch: true,
            updateCycleFailure: false,
          }
        : undefined,
    );

    if (batch.sourceType === "LP") {
      await repository.synchronizeCycleState(batch.cycleId);
    }

    logger.error(
      {
        err: error,
        importBatchId: batch.id,
        cycleId: batch.cycleId,
        sourceType: batch.sourceType,
      },
      "Import batch processing failed unexpectedly",
    );

    throw error;
  }
}
