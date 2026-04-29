import { prisma, Prisma, type $Enums } from "@vendorstream/database";

const CREATE_MANY_CHUNK_SIZE = 500;

const RECONCILABLE_BATCH_STATUSES: $Enums.ImportBatchStatus[] = [
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
  "RECONCILED",
];

type CurrentBatchSummary = {
  id: string;
  sourceType: $Enums.BatchSourceType;
  status: $Enums.ImportBatchStatus;
};

type NormalizedLpRowRecord = Awaited<
  ReturnType<typeof prisma.normalizedLpRow.findMany>
>[number];

type NormalizedStoreRowRecord = Awaited<
  ReturnType<typeof prisma.normalizedStoreRow.findMany>
>[number];

type CategoryRuleRecord = Awaited<
  ReturnType<typeof prisma.categoryRule.findMany>
>[number];

type ProductScaleRuleRecord = Awaited<
  ReturnType<typeof prisma.productScaleRule.findMany>
>[number];

export type CycleForReconciliation = {
  cycle: {
    id: string;
    lpId: string;
    storeLocationId: string;
    periodMonth: Date;
    status: $Enums.CycleStatus;
  };
  currentLpBatch: CurrentBatchSummary | null;
  currentStoreBatch: CurrentBatchSummary | null;
  lpRows: NormalizedLpRowRecord[];
  storeRows: NormalizedStoreRowRecord[];
  categoryRules: CategoryRuleRecord[];
  productScaleRules: ProductScaleRuleRecord[];
};

export type ReconciliationResultDraft = {
  id: string;
  lpRowId: string | null;
  storeRowId: string | null;
  status: $Enums.ReconciliationStatus;
  barcode: string | null;
  productName: string | null;
  categoryKey: string | null;
  lpSalesAmount: number | null;
  lpSalesUnits: number | null;
  storeSalesAmount: number | null;
  storeSalesUnits: number | null;
  chosenUnitPrice: number | null;
  categoryRuleId: string | null;
  productScaleRuleId: string | null;
  calculatedCommissionPercent: number | null;
  calculatedCommissionAmount: number | null;
  details: Prisma.InputJsonValue;
};

export type MismatchDraft = {
  id: string;
  reconciliationResultId: string | null;
  type: $Enums.MismatchType;
  fieldName: string | null;
  message: string;
  details: Prisma.InputJsonValue;
};

type PersistReconciliationOutcomeArgs = {
  cycleId: string;
  resultRows: ReconciliationResultDraft[];
  mismatches: MismatchDraft[];
  finalCycleStatus: $Enums.CycleStatus;
  reconciliationPassedAt: Date | null;
};

async function createManyInChunks<T>(
  values: T[],
  writer: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += CREATE_MANY_CHUNK_SIZE) {
    const chunk = values.slice(index, index + CREATE_MANY_CHUNK_SIZE);
    await writer(chunk);
  }
}

export class ReconciliationRepository {
  async getCycleForReconciliation(
    cycleId: string,
  ): Promise<CycleForReconciliation | null> {
    const cycle = await prisma.reconciliationCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        lpId: true,
        storeLocationId: true,
        periodMonth: true,
        status: true,
      },
    });

    if (!cycle) {
      return null;
    }

    const currentBatches = await prisma.importBatch.findMany({
      where: {
        cycleId,
        isCurrent: true,
      },
      select: {
        id: true,
        sourceType: true,
        status: true,
      },
    });

    const currentLpBatch =
      currentBatches.find((batch) => batch.sourceType === "LP") ?? null;
    const currentStoreBatch =
      currentBatches.find((batch) => batch.sourceType === "STORE") ?? null;

    const [lpRows, storeRows, categoryRules, productScaleRules] =
      await prisma.$transaction([
        prisma.normalizedLpRow.findMany({
          where: currentLpBatch
            ? {
                cycleId,
                importBatchId: currentLpBatch.id,
              }
            : {
                cycleId,
                id: "__never__",
              },
          orderBy: {
            sourceRowNumber: "asc",
          },
        }),
        prisma.normalizedStoreRow.findMany({
          where: currentStoreBatch
            ? {
                cycleId,
                importBatchId: currentStoreBatch.id,
              }
            : {
                cycleId,
                id: "__never__",
              },
          orderBy: {
            sourceRowNumber: "asc",
          },
        }),
        prisma.categoryRule.findMany({
          where: {
            lpId: cycle.lpId,
            isActive: true,
            AND: [
              {
                OR: [
                  { effectiveFrom: null },
                  { effectiveFrom: { lte: cycle.periodMonth } },
                ],
              },
              {
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gte: cycle.periodMonth } },
                ],
              },
            ],
          },
          orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
        }),
        prisma.productScaleRule.findMany({
          where: {
            lpId: cycle.lpId,
            isActive: true,
            AND: [
              {
                OR: [
                  { effectiveFrom: null },
                  { effectiveFrom: { lte: cycle.periodMonth } },
                ],
              },
              {
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gte: cycle.periodMonth } },
                ],
              },
            ],
          },
          orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
        }),
      ]);

    return {
      cycle,
      currentLpBatch,
      currentStoreBatch,
      lpRows,
      storeRows,
      categoryRules,
      productScaleRules,
    };
  }

  async beginCycleReconciliation(
    cycleId: string,
    batchIds: string[],
  ): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.mismatch.deleteMany({
        where: {
          cycleId,
        },
      });

      // TODO: version reconciliation results before allowing reruns after statements are finalized.
      await tx.reconciliationResult.deleteMany({
        where: {
          cycleId,
        },
      });

      if (batchIds.length > 0) {
        await tx.importBatch.updateMany({
          where: {
            id: {
              in: batchIds,
            },
          },
          data: {
            status: "RECONCILING",
          },
        });
      }

      await tx.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "RECONCILING",
          lastError: null,
          reconciliationPassedAt: null,
        },
      });
    });
  }

  async persistReconciliationOutcome({
    cycleId,
    resultRows,
    mismatches,
    finalCycleStatus,
    reconciliationPassedAt,
  }: PersistReconciliationOutcomeArgs): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await createManyInChunks(resultRows, async (chunk) => {
        await tx.reconciliationResult.createMany({
          data: chunk.map((row) => ({
            id: row.id,
            cycleId,
            lpRowId: row.lpRowId,
            storeRowId: row.storeRowId,
            status: row.status,
            barcode: row.barcode,
            productName: row.productName,
            categoryKey: row.categoryKey,
            lpSalesAmount: row.lpSalesAmount,
            lpSalesUnits: row.lpSalesUnits,
            storeSalesAmount: row.storeSalesAmount,
            storeSalesUnits: row.storeSalesUnits,
            chosenUnitPrice: row.chosenUnitPrice,
            categoryRuleId: row.categoryRuleId,
            productScaleRuleId: row.productScaleRuleId,
            calculatedCommissionPercent: row.calculatedCommissionPercent,
            calculatedCommissionAmount: row.calculatedCommissionAmount,
            details: row.details,
          })),
        });
      });

      await createManyInChunks(mismatches, async (chunk) => {
        await tx.mismatch.createMany({
          data: chunk.map((row) => ({
            id: row.id,
            cycleId,
            reconciliationResultId: row.reconciliationResultId,
            type: row.type,
            fieldName: row.fieldName,
            message: row.message,
            details: row.details,
          })),
        });
      });

      await tx.importBatch.updateMany({
        where: {
          cycleId,
          isCurrent: true,
          status: {
            in: RECONCILABLE_BATCH_STATUSES,
          },
        },
        data: {
          status: "RECONCILED",
        },
      });

      await tx.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: finalCycleStatus,
          lastError: null,
          reconciliationPassedAt,
        },
      });
    });
  }

  async markCycleReconciliationFailed(
    cycleId: string,
    errorMessage: string,
  ): Promise<void> {
    await prisma.$transaction([
      prisma.importBatch.updateMany({
        where: {
          cycleId,
          isCurrent: true,
          status: "RECONCILING",
        },
        data: {
          status: "READY_FOR_RECONCILIATION",
        },
      }),
      prisma.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "FAILED",
          lastError: errorMessage,
          reconciliationPassedAt: null,
        },
      }),
    ]);
  }
}
