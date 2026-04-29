import {
  prisma,
  Prisma,
  recordAuditLog,
  type $Enums,
} from "@vendorstream/database";

import type { ParsedLpWorkbook, ParsedStoreWorkbook } from "../services/import-batch/types.js";

const CREATE_MANY_CHUNK_SIZE = 500;

const BATCH_FAILURE_STATUSES: $Enums.ImportBatchStatus[] = [
  "PREVALIDATION_FAILED",
  "VALIDATION_FAILED",
  "FAILED",
  "CANCELED",
];

const BATCH_IN_PROGRESS_STATUSES: $Enums.ImportBatchStatus[] = [
  "RECEIVED",
  "VALIDATING",
];

const BATCH_SUCCESS_STAGING_STATUSES: $Enums.ImportBatchStatus[] = [
  "STAGED",
  "WAITING_FOR_COUNTERPART",
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
  "RECONCILED",
];

export type ImportBatchForProcessing = Prisma.ImportBatchGetPayload<{
  include: {
    uploadedFile: true;
    cycle: {
      include: {
        lp: true;
        storeLocation: {
          include: {
            storeOrganization: true;
          };
        };
      };
    };
  };
}>;

async function createManyInChunks<T>(
  values: T[],
  writer: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += CREATE_MANY_CHUNK_SIZE) {
    const chunk = values.slice(index, index + CREATE_MANY_CHUNK_SIZE);
    await writer(chunk);
  }
}

export class ImportBatchRepository {
  async getImportBatchForProcessing(
    importBatchId: string,
  ): Promise<ImportBatchForProcessing | null> {
    return prisma.importBatch.findUnique({
      where: {
        id: importBatchId,
      },
      include: {
        uploadedFile: true,
        cycle: {
          include: {
            lp: true,
            storeLocation: {
              include: {
                storeOrganization: true,
              },
            },
          },
        },
      },
    });
  }

  async resetBatchForProcessing(
    importBatchId: string,
    cycleId: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.normalizedLpRow.deleteMany({
        where: { importBatchId },
      });
      await tx.normalizedStoreRow.deleteMany({
        where: { importBatchId },
      });
      await tx.rawLpRow.deleteMany({
        where: { importBatchId },
      });
      await tx.rawStoreRow.deleteMany({
        where: { importBatchId },
      });
      await tx.importBatch.update({
        where: { id: importBatchId },
        data: {
          status: "VALIDATING",
          totalRowCount: null,
          validRowCount: null,
          invalidRowCount: null,
          preValidationErrors: Prisma.DbNull,
          validationSummary: Prisma.DbNull,
          processedAt: null,
          failedAt: null,
        },
      });
      const batch = await tx.importBatch.findUnique({
        where: { id: importBatchId },
        select: {
          sourceType: true,
          uploadedFileId: true,
        },
      });
      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.validation.started",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: batch
          ? {
              sourceType: batch.sourceType,
              uploadedFileId: batch.uploadedFileId,
            }
          : undefined,
      });
      await tx.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "PROCESSING",
          lastError: null,
        },
      });
    });
  }

  async markBatchPrevalidationFailed(
    importBatchId: string,
    cycleId: string,
    errorMessage: string,
    details: Prisma.InputJsonObject,
    options?: {
      demoteBatch?: boolean;
      updateCycleFailure?: boolean;
    },
  ): Promise<void> {
    const now = new Date();
    const updateCycleFailure = options?.updateCycleFailure ?? true;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const batch = await tx.importBatch.findUnique({
        where: { id: importBatchId },
        select: {
          sourceType: true,
          uploadedFileId: true,
        },
      });
      await tx.importBatch.update({
        where: { id: importBatchId },
        data: {
          status: "PREVALIDATION_FAILED",
          isCurrent: options?.demoteBatch ? false : undefined,
          preValidationErrors: details,
          validationSummary: {
            ...details,
            errorMessage,
          },
          failedAt: now,
          processedAt: null,
          totalRowCount: 0,
          validRowCount: 0,
          invalidRowCount: 0,
        },
      });

      if (updateCycleFailure) {
        await tx.reconciliationCycle.update({
          where: { id: cycleId },
          data: {
            status: "FAILED",
            lastError: errorMessage,
          },
        });
      }
      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.prevalidation_failed",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: {
          sourceType: batch?.sourceType,
          uploadedFileId: batch?.uploadedFileId,
          errorMessage,
          ...details,
        },
      });
    });
  }

  async markBatchValidationFailed(
    importBatchId: string,
    cycleId: string,
    validationSummary: Prisma.InputJsonObject,
    errorMessage: string,
    counts: {
      totalRowCount: number;
      validRowCount: number;
      invalidRowCount: number;
    },
  ): Promise<void> {
    const now = new Date();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.importBatch.update({
        where: { id: importBatchId },
        data: {
          status: "VALIDATION_FAILED",
          totalRowCount: counts.totalRowCount,
          validRowCount: counts.validRowCount,
          invalidRowCount: counts.invalidRowCount,
          validationSummary: {
            ...validationSummary,
            errorMessage,
          },
          failedAt: now,
          processedAt: null,
        },
      });
      await tx.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "FAILED",
          lastError: errorMessage,
        },
      });
      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.validation_failed",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: {
          errorMessage,
          ...validationSummary,
        },
      });
    });
  }

  async persistLpWorkbookValidationFailure(
    importBatchId: string,
    cycleId: string,
    parsedWorkbook: ParsedLpWorkbook,
    errorMessage: string,
  ): Promise<void> {
    const now = new Date();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await createManyInChunks(parsedWorkbook.rawRows, async (chunk) => {
        await tx.rawLpRow.createMany({
          data: chunk.map((row) => ({
            id: row.id,
            importBatchId,
            sourceRowNumber: row.sourceRowNumber,
            parseStatus: row.parseErrors ? "FAILED" : "PARSED",
            rawData: row.rawData,
            parseErrors: row.parseErrors ?? undefined,
          })),
        });
      });

      await tx.importBatch.update({
        where: { id: importBatchId },
        data: {
          status: "VALIDATION_FAILED",
          isCurrent: false,
          totalRowCount: parsedWorkbook.totalRowCount,
          validRowCount: parsedWorkbook.validRowCount,
          invalidRowCount: parsedWorkbook.invalidRowCount,
          preValidationErrors: Prisma.DbNull,
          validationSummary: {
            ...parsedWorkbook.validationSummary,
            errorMessage,
          },
          processedAt: null,
          failedAt: now,
        },
      });

      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.validation_failed",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: {
          errorMessage,
          ...parsedWorkbook.validationSummary,
        },
      });
    });
  }

  async persistLpWorkbookResult(
    importBatchId: string,
    cycleId: string,
    parsedWorkbook: ParsedLpWorkbook,
  ): Promise<void> {
    const now = new Date();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await createManyInChunks(parsedWorkbook.rawRows, async (chunk) => {
        await tx.rawLpRow.createMany({
          data: chunk.map((row) => ({
            id: row.id,
            importBatchId,
            sourceRowNumber: row.sourceRowNumber,
            parseStatus: row.parseErrors ? "FAILED" : "PARSED",
            rawData: row.rawData,
            parseErrors: row.parseErrors ?? undefined,
          })),
        });
      });

      await createManyInChunks(parsedWorkbook.normalizedRows, async (chunk) => {
        await tx.normalizedLpRow.createMany({
          data: chunk.map((row) => ({
            id: row.id,
            importBatchId,
            rawRowId: row.rawRowId,
            cycleId,
            sourceRowNumber: row.sourceRowNumber,
            canonicalBarcode: row.canonicalBarcode,
            barcodeNormalized: row.barcodeNormalized,
            productName: row.productName,
            categoryKey: row.categoryKey,
            subCategoryKey: row.subCategoryKey,
            salesAmount: row.salesAmount,
            salesUnits: row.salesUnits,
            unitPricePrimary: row.unitPricePrimary,
            unitPriceFallback: row.unitPriceFallback,
            finalUnitPrice: row.finalUnitPrice,
            usedFallbackPrice: row.usedFallbackPrice,
            rowFingerprint: row.rowFingerprint,
            normalizedData: row.normalizedData,
          })),
        });
      });

      await tx.importBatch.updateMany({
        where: {
          cycleId,
          sourceType: "LP",
          isCurrent: true,
          id: {
            not: importBatchId,
          },
        },
        data: {
          isCurrent: false,
        },
      });

      await tx.importBatch.update({
        where: { id: importBatchId },
        data: {
          status: "STAGED",
          isCurrent: true,
          totalRowCount: parsedWorkbook.totalRowCount,
          validRowCount: parsedWorkbook.validRowCount,
          invalidRowCount: parsedWorkbook.invalidRowCount,
          preValidationErrors: Prisma.DbNull,
          validationSummary: parsedWorkbook.validationSummary,
          processedAt: now,
          failedAt: null,
        },
      });

      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.validation_passed",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: {
          sourceType: "LP",
          ...parsedWorkbook.validationSummary,
        },
      });

      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.promoted_current",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: {
          sourceType: "LP",
        },
      });
    });
  }

  async persistStoreWorkbookResult(
    importBatchId: string,
    cycleId: string,
    parsedWorkbook: ParsedStoreWorkbook,
  ): Promise<void> {
    const now = new Date();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await createManyInChunks(parsedWorkbook.rawRows, async (chunk) => {
        await tx.rawStoreRow.createMany({
          data: chunk.map((row) => ({
            id: row.id,
            importBatchId,
            sourceRowNumber: row.sourceRowNumber,
            parseStatus: row.parseErrors ? "FAILED" : "PARSED",
            rawData: row.rawData,
            parseErrors: row.parseErrors ?? undefined,
          })),
        });
      });

      await createManyInChunks(parsedWorkbook.normalizedRows, async (chunk) => {
        await tx.normalizedStoreRow.createMany({
          data: chunk.map((row) => ({
            id: row.id,
            importBatchId,
            rawRowId: row.rawRowId,
            cycleId,
            sourceRowNumber: row.sourceRowNumber,
            canonicalBarcode: row.canonicalBarcode,
            barcodeNormalized: row.barcodeNormalized,
            productName: row.productName,
            categoryKey: row.categoryKey,
            subCategoryKey: row.subCategoryKey,
            salesAmount: row.salesAmount,
            salesUnits: row.salesUnits,
            unitPricePrimary: row.unitPricePrimary,
            unitPriceFallback: row.unitPriceFallback,
            finalUnitPrice: row.finalUnitPrice,
            usedFallbackPrice: row.usedFallbackPrice,
            rowFingerprint: row.rowFingerprint,
            normalizedData: row.normalizedData,
          })),
        });
      });

      await tx.importBatch.updateMany({
        where: {
          cycleId,
          sourceType: "STORE",
          isCurrent: true,
          id: {
            not: importBatchId,
          },
        },
        data: {
          isCurrent: false,
        },
      });

      await tx.importBatch.update({
        where: { id: importBatchId },
        data: {
          status: "STAGED",
          isCurrent: true,
          totalRowCount: parsedWorkbook.totalRowCount,
          validRowCount: parsedWorkbook.validRowCount,
          invalidRowCount: parsedWorkbook.invalidRowCount,
          preValidationErrors: Prisma.DbNull,
          validationSummary: parsedWorkbook.validationSummary,
          processedAt: now,
          failedAt: null,
        },
      });

      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.validation_passed",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: {
          sourceType: "STORE",
          ...parsedWorkbook.validationSummary,
        },
      });

      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.promoted_current",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: {
          sourceType: "STORE",
        },
      });
    });
  }

  async persistStoreWorkbookValidationFailure(
    importBatchId: string,
    cycleId: string,
    parsedWorkbook: ParsedStoreWorkbook,
    errorMessage: string,
  ): Promise<void> {
    const now = new Date();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await createManyInChunks(parsedWorkbook.rawRows, async (chunk) => {
        await tx.rawStoreRow.createMany({
          data: chunk.map((row) => ({
            id: row.id,
            importBatchId,
            sourceRowNumber: row.sourceRowNumber,
            parseStatus: row.parseErrors ? "FAILED" : "PARSED",
            rawData: row.rawData,
            parseErrors: row.parseErrors ?? undefined,
          })),
        });
      });

      await tx.importBatch.update({
        where: { id: importBatchId },
        data: {
          status: "VALIDATION_FAILED",
          isCurrent: false,
          totalRowCount: parsedWorkbook.totalRowCount,
          validRowCount: parsedWorkbook.validRowCount,
          invalidRowCount: parsedWorkbook.invalidRowCount,
          preValidationErrors: Prisma.DbNull,
          validationSummary: {
            ...parsedWorkbook.validationSummary,
            errorMessage,
          },
          processedAt: null,
          failedAt: now,
        },
      });

      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.validation_failed",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: {
          sourceType: "STORE",
          errorMessage,
          ...parsedWorkbook.validationSummary,
        },
      });
    });
  }

  async markBatchFailed(
    importBatchId: string,
    cycleId: string,
    errorMessage: string,
    details?: Prisma.InputJsonObject,
    options?: {
      demoteBatch?: boolean;
      updateCycleFailure?: boolean;
    },
  ): Promise<void> {
    const now = new Date();
    const updateCycleFailure = options?.updateCycleFailure ?? true;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.importBatch.update({
        where: { id: importBatchId },
        data: {
          status: "FAILED",
          isCurrent: options?.demoteBatch ? false : undefined,
          failedAt: now,
          validationSummary: details
            ? {
                ...details,
                errorMessage,
              }
            : {
                errorMessage,
              },
        },
      });

      if (updateCycleFailure) {
        await tx.reconciliationCycle.update({
          where: { id: cycleId },
          data: {
            status: "FAILED",
            lastError: errorMessage,
          },
        });
      }
      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.failed",
        entityType: "IMPORT_BATCH",
        entityId: importBatchId,
        cycleId,
        batchId: importBatchId,
        metadata: details
          ? {
              ...details,
              errorMessage,
            }
          : {
              errorMessage,
            },
      });
    });
  }

  async synchronizeCycleState(cycleId: string): Promise<$Enums.CycleStatus | null> {
    const cycle = await prisma.reconciliationCycle.findUnique({
      where: { id: cycleId },
      include: {
        importBatches: {
          where: {
            isCurrent: true,
          },
          select: {
            id: true,
            sourceType: true,
            status: true,
          },
        },
      },
    });

    if (!cycle) {
      return null;
    }

    const currentBatches: Array<{
      id: string;
      sourceType: $Enums.BatchSourceType;
      status: $Enums.ImportBatchStatus;
    }> = cycle.importBatches;
    const hasFailedBatch = currentBatches.some((batch) =>
      BATCH_FAILURE_STATUSES.includes(batch.status),
    );

    if (hasFailedBatch) {
      await prisma.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "FAILED",
        },
      });
      return "FAILED";
    }

    const hasInProgressBatch = currentBatches.some((batch) =>
      BATCH_IN_PROGRESS_STATUSES.includes(batch.status),
    );

    if (hasInProgressBatch) {
      await prisma.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "PROCESSING",
          lastError: null,
        },
      });
      return "PROCESSING";
    }

    const lpBatch = currentBatches.find((batch) => batch.sourceType === "LP");
    const storeBatch = currentBatches.find(
      (batch) => batch.sourceType === "STORE",
    );

    const bothSidesReady =
      lpBatch &&
      storeBatch &&
      BATCH_SUCCESS_STAGING_STATUSES.includes(lpBatch.status) &&
      BATCH_SUCCESS_STAGING_STATUSES.includes(storeBatch.status);

    const targetBatchStatus: $Enums.ImportBatchStatus = bothSidesReady
      ? "READY_FOR_RECONCILIATION"
      : "WAITING_FOR_COUNTERPART";
    const targetCycleStatus: $Enums.CycleStatus = bothSidesReady
      ? "READY_FOR_RECONCILIATION"
      : "AWAITING_UPLOADS";

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.importBatch.updateMany({
        where: {
          cycleId,
          isCurrent: true,
          status: {
            in: BATCH_SUCCESS_STAGING_STATUSES,
          },
        },
        data: {
          status: targetBatchStatus,
        },
      });

      await tx.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: targetCycleStatus,
          lastError: null,
        },
      });
    });

    return targetCycleStatus;
  }

  async findFailedBatchesForRetentionCleanup(args: {
    cutoff: Date;
    take: number;
  }) {
    return prisma.importBatch.findMany({
      where: {
        sourceType: {
          in: ["LP", "STORE"],
        },
        status: {
          in: ["PREVALIDATION_FAILED", "VALIDATION_FAILED", "FAILED"],
        },
        failedAt: {
          lt: args.cutoff,
        },
        OR: [
          {
            uploadedFile: {
              deletedAt: null,
            },
          },
          {
            rawLpRows: {
              some: {},
            },
          },
          {
            normalizedLpRows: {
              some: {},
            },
          },
          {
            rawStoreRows: {
              some: {},
            },
          },
          {
            normalizedStoreRows: {
              some: {},
            },
          },
        ],
      },
      orderBy: {
        failedAt: "asc",
      },
      take: args.take,
      select: {
        id: true,
        sourceType: true,
        uploadedFileId: true,
        uploadedFile: {
          select: {
            id: true,
            bucket: true,
            storagePath: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  async markFailedBatchArtifactsCleaned(args: {
    importBatchId: string;
    uploadedFileId: string;
    sourceType: $Enums.BatchSourceType;
    deletedAt: Date;
  }): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (args.sourceType === "LP") {
        await tx.normalizedLpRow.deleteMany({
          where: {
            importBatchId: args.importBatchId,
          },
        });

        await tx.rawLpRow.deleteMany({
          where: {
            importBatchId: args.importBatchId,
          },
        });
      } else {
        await tx.normalizedStoreRow.deleteMany({
          where: {
            importBatchId: args.importBatchId,
          },
        });

        await tx.rawStoreRow.deleteMany({
          where: {
            importBatchId: args.importBatchId,
          },
        });
      }

      await tx.uploadedFile.update({
        where: {
          id: args.uploadedFileId,
        },
        data: {
          deletedAt: args.deletedAt,
        },
      });

      await recordAuditLog(tx, {
        actorType: "SYSTEM",
        action: "import_batch.failed_artifacts_cleaned",
        entityType: "IMPORT_BATCH",
        entityId: args.importBatchId,
        batchId: args.importBatchId,
        metadata: {
          sourceType: args.sourceType,
          uploadedFileId: args.uploadedFileId,
          cleanedAt: args.deletedAt.toISOString(),
        },
      });
    });
  }
}
