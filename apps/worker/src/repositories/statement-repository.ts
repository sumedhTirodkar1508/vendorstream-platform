import { prisma, Prisma, type $Enums } from "@vendorstream/database";

const CREATE_MANY_CHUNK_SIZE = 200;

async function processInChunks<T>(
  values: T[],
  processor: (chunk: T[]) => Promise<void>,
): Promise<void> {
  for (let index = 0; index < values.length; index += CREATE_MANY_CHUNK_SIZE) {
    const chunk = values.slice(index, index + CREATE_MANY_CHUNK_SIZE);
    await processor(chunk);
  }
}

export type StatementGenerationLineItemDraft = {
  reconciliationResultId: string;
  barcode: string | null;
  productName: string | null;
  categoryKey: string | null;
  lpSalesUnits: number | null;
  storeSalesUnits: number | null;
  reconciledUnits: number | null;
  unitPrice: number | null;
  categoryMaxScale: number | null;
  categoryMaxCommissionPercent: number | null;
  productScale: number | null;
  commissionPercent: number | null;
  commissionAmount: number | null;
  notes: string | null;
  sortOrder: number;
};

type StatementGenerationResultRecord = {
  id: string;
  status: $Enums.ReconciliationStatus;
  lpRowId: string | null;
  storeRowId: string | null;
  barcode: string | null;
  productName: string | null;
  categoryKey: string | null;
  lpSalesAmount: Prisma.Decimal | null;
  lpSalesUnits: Prisma.Decimal | null;
  storeSalesAmount: Prisma.Decimal | null;
  storeSalesUnits: Prisma.Decimal | null;
  chosenUnitPrice: Prisma.Decimal | null;
  details: Prisma.JsonValue;
  categoryRule: {
    id: string;
    maxScale: Prisma.Decimal;
    maxCommissionPercent: Prisma.Decimal;
  } | null;
  productScaleRule: {
    id: string;
    productScale: Prisma.Decimal;
  } | null;
};

export type StatementTaskForGeneration = {
  task: {
    id: string;
    cycleId: string;
    status: $Enums.StatementTaskStatus;
    attemptCount: number;
    createdAt: Date;
    updatedAt: Date;
  };
  cycle: {
    id: string;
    status: $Enums.CycleStatus;
    reconciliationPassedAt: Date | null;
    statementReadyAt: Date | null;
    periodMonth: Date;
  };
  openMismatchCount: number;
  existingStatementForTask: {
    id: string;
    version: number;
    status: $Enums.StatementStatus;
    generatedAt: Date | null;
  } | null;
  results: StatementGenerationResultRecord[];
};

type CompletedStatementSummary = {
  statementId: string;
  version: number;
  reusedExistingStatement: boolean;
};

type CompleteGeneratedStatementArgs = {
  statementTaskId: string;
  cycleId: string;
  currency: string;
  totalSalesAmount: number;
  totalSalesUnits: number;
  totalCommissionAmount: number;
  lineItems: StatementGenerationLineItemDraft[];
};

type SyncExistingStatementArgs = {
  statementTaskId: string;
  cycleId: string;
  generatedAt: Date | null;
};

type StatementArtifactLineItemRecord = {
  sortOrder: number;
  barcode: string | null;
  productName: string | null;
  categoryKey: string | null;
  reconciledUnits: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal | null;
  commissionPercent: Prisma.Decimal | null;
  commissionAmount: Prisma.Decimal | null;
  notes: string | null;
};

export type StatementArtifactRecord = {
  id: string;
  cycleId: string;
  version: number;
  status: $Enums.StatementStatus;
  currency: string;
  totalSalesAmount: Prisma.Decimal | null;
  totalSalesUnits: Prisma.Decimal | null;
  totalCommissionAmount: Prisma.Decimal | null;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  generatedFileId: string | null;
  generatedFile: {
    id: string;
    bucket: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string | null;
    sizeBytes: bigint;
  } | null;
  cycle: {
    lpId: string;
    storeLocationId: string;
    periodMonth: Date;
    lp: {
      name: string;
    };
    storeLocation: {
      name: string;
      storeOrganization: {
        name: string;
      };
    };
  };
  lineItems: StatementArtifactLineItemRecord[];
};

const ELIGIBLE_STATEMENT_CYCLE_STATUSES: $Enums.CycleStatus[] = [
  "RECONCILIATION_PASSED",
  "STATEMENT_PENDING",
  "STATEMENT_GENERATING",
  "STATEMENT_READY",
];

export class StatementRepository {
  async ensurePendingTaskForCycle(cycleId: string): Promise<{
    id: string;
    cycleId: string;
  } | null> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const cycle = await tx.reconciliationCycle.findUnique({
        where: { id: cycleId },
        select: {
          id: true,
          status: true,
        },
      });

      if (!cycle || !ELIGIBLE_STATEMENT_CYCLE_STATUSES.includes(cycle.status)) {
        return null;
      }

      const existingPendingTask = await tx.statementTask.findFirst({
        where: {
          cycleId,
          status: "PENDING",
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          cycleId: true,
        },
      });

      if (existingPendingTask) {
        await tx.reconciliationCycle.update({
          where: { id: cycleId },
          data: {
            status: "STATEMENT_PENDING",
            lastError: null,
          },
        });

        return existingPendingTask;
      }

      const existingProcessingTask = await tx.statementTask.findFirst({
        where: {
          cycleId,
          status: "PROCESSING",
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
        },
      });

      if (existingProcessingTask) {
        return null;
      }

      const createdTask = await tx.statementTask.create({
        data: {
          cycleId,
          status: "PENDING",
        },
        select: {
          id: true,
          cycleId: true,
        },
      });

      await tx.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "STATEMENT_PENDING",
          lastError: null,
        },
      });

      return createdTask;
    });
  }

  async getTaskForGeneration(
    statementTaskId: string,
  ): Promise<StatementTaskForGeneration | null> {
    const [task, openMismatchCount, existingStatementForTask, results] =
      await prisma.$transaction([
        prisma.statementTask.findUnique({
          where: { id: statementTaskId },
          select: {
            id: true,
            cycleId: true,
            status: true,
            attemptCount: true,
            createdAt: true,
            updatedAt: true,
            cycle: {
              select: {
                id: true,
                status: true,
                reconciliationPassedAt: true,
                statementReadyAt: true,
                periodMonth: true,
              },
            },
          },
        }),
        prisma.mismatch.count({
          where: {
            cycle: {
              statementTasks: {
                some: {
                  id: statementTaskId,
                },
              },
            },
            status: "OPEN",
          },
        }),
        prisma.statement.findFirst({
          where: {
            taskId: statementTaskId,
          },
          orderBy: [{ version: "desc" }],
          select: {
            id: true,
            version: true,
            status: true,
            generatedAt: true,
          },
        }),
        prisma.reconciliationResult.findMany({
          where: {
            cycle: {
              statementTasks: {
                some: {
                  id: statementTaskId,
                },
              },
            },
          },
          orderBy: [{ barcode: "asc" }, { productName: "asc" }, { id: "asc" }],
          select: {
            id: true,
            status: true,
            lpRowId: true,
            storeRowId: true,
            barcode: true,
            productName: true,
            categoryKey: true,
            lpSalesAmount: true,
            lpSalesUnits: true,
            storeSalesAmount: true,
            storeSalesUnits: true,
            chosenUnitPrice: true,
            details: true,
            categoryRule: {
              select: {
                id: true,
                maxScale: true,
                maxCommissionPercent: true,
              },
            },
            productScaleRule: {
              select: {
                id: true,
                productScale: true,
              },
            },
          },
        }),
      ]);

    if (!task) {
      return null;
    }

    return {
      task,
      cycle: task.cycle,
      openMismatchCount,
      existingStatementForTask,
      results,
    };
  }

  async beginStatementGeneration(
    statementTaskId: string,
    cycleId: string,
  ): Promise<void> {
    const now = new Date();

    await prisma.$transaction([
      prisma.statementTask.update({
        where: { id: statementTaskId },
        data: {
          status: "PROCESSING",
          attemptCount: {
            increment: 1,
          },
          startedAt: now,
          completedAt: null,
          lastError: null,
        },
      }),
      prisma.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "STATEMENT_GENERATING",
          lastError: null,
        },
      }),
    ]);
  }

  async completeGeneratedStatement({
    statementTaskId,
    cycleId,
    currency,
    totalSalesAmount,
    totalSalesUnits,
    totalCommissionAmount,
    lineItems,
  }: CompleteGeneratedStatementArgs): Promise<CompletedStatementSummary> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingStatement = await tx.statement.findFirst({
        where: {
          taskId: statementTaskId,
        },
        orderBy: [{ version: "desc" }],
        select: {
          id: true,
          version: true,
          generatedAt: true,
        },
      });

      const readyAt = existingStatement?.generatedAt ?? new Date();

      if (existingStatement) {
        await tx.statementTask.update({
          where: { id: statementTaskId },
          data: {
            status: "COMPLETED",
            lastError: null,
            completedAt: readyAt,
          },
        });

        await tx.reconciliationCycle.update({
          where: { id: cycleId },
          data: {
            status: "STATEMENT_READY",
            lastError: null,
            statementReadyAt: readyAt,
          },
        });

        return {
          statementId: existingStatement.id,
          version: existingStatement.version,
          reusedExistingStatement: true,
        };
      }

      const latestStatement = await tx.statement.findFirst({
        where: { cycleId },
        orderBy: [{ version: "desc" }],
        select: {
          version: true,
        },
      });

      const nextVersion = (latestStatement?.version ?? 0) + 1;

      // TODO: Promote the generated statement from DRAFT to FINAL when file
      // rendering and signed delivery are implemented.
      const statement = await tx.statement.create({
        data: {
          cycleId,
          taskId: statementTaskId,
          version: nextVersion,
          status: "DRAFT",
          currency,
          totalSalesAmount,
          totalSalesUnits,
          totalCommissionAmount,
          generatedAt: readyAt,
        },
        select: {
          id: true,
          version: true,
        },
      });

      await processInChunks(lineItems, async (chunk) => {
        await tx.statementLineItem.createMany({
          data: chunk.map((item) => ({
            statementId: statement.id,
            reconciliationResultId: item.reconciliationResultId,
            barcode: item.barcode,
            productName: item.productName,
            categoryKey: item.categoryKey,
            lpSalesUnits: item.lpSalesUnits,
            storeSalesUnits: item.storeSalesUnits,
            reconciledUnits: item.reconciledUnits,
            unitPrice: item.unitPrice,
            categoryMaxScale: item.categoryMaxScale,
            categoryMaxCommissionPercent: item.categoryMaxCommissionPercent,
            productScale: item.productScale,
            commissionPercent: item.commissionPercent,
            commissionAmount: item.commissionAmount,
            notes: item.notes,
            sortOrder: item.sortOrder,
          })),
        });
      });

      await processInChunks(lineItems, async (chunk) => {
        for (const item of chunk) {
          await tx.reconciliationResult.update({
            where: {
              id: item.reconciliationResultId,
            },
            data: {
              calculatedCommissionPercent: item.commissionPercent,
              calculatedCommissionAmount: item.commissionAmount,
            },
          });
        }
      });

      await tx.statementTask.update({
        where: { id: statementTaskId },
        data: {
          status: "COMPLETED",
          lastError: null,
          completedAt: readyAt,
        },
      });

      await tx.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "STATEMENT_READY",
          lastError: null,
          statementReadyAt: readyAt,
        },
      });

      return {
        statementId: statement.id,
        version: statement.version,
        reusedExistingStatement: false,
      };
    });
  }

  async syncExistingGeneratedStatement({
    statementTaskId,
    cycleId,
    generatedAt,
  }: SyncExistingStatementArgs): Promise<void> {
    const readyAt = generatedAt ?? new Date();

    await prisma.$transaction([
      prisma.statementTask.update({
        where: { id: statementTaskId },
        data: {
          status: "COMPLETED",
          lastError: null,
          completedAt: readyAt,
        },
      }),
      prisma.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status: "STATEMENT_READY",
          lastError: null,
          statementReadyAt: readyAt,
        },
      }),
    ]);
  }

  async getStatementArtifactRecord(
    statementId: string,
  ): Promise<StatementArtifactRecord | null> {
    return prisma.statement.findUnique({
      where: { id: statementId },
      select: {
        id: true,
        cycleId: true,
        version: true,
        status: true,
        currency: true,
        totalSalesAmount: true,
        totalSalesUnits: true,
        totalCommissionAmount: true,
        generatedAt: true,
        createdAt: true,
        updatedAt: true,
        generatedFileId: true,
        generatedFile: {
          select: {
            id: true,
            bucket: true,
            storagePath: true,
            originalFilename: true,
            mimeType: true,
            sizeBytes: true,
          },
        },
        cycle: {
          select: {
            lpId: true,
            storeLocationId: true,
            periodMonth: true,
            lp: {
              select: {
                name: true,
              },
            },
            storeLocation: {
              select: {
                name: true,
                storeOrganization: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        lineItems: {
          orderBy: [{ sortOrder: "asc" }],
          select: {
            sortOrder: true,
            barcode: true,
            productName: true,
            categoryKey: true,
            reconciledUnits: true,
            unitPrice: true,
            commissionPercent: true,
            commissionAmount: true,
            notes: true,
          },
        },
      },
    });
  }

  async linkGeneratedFileToStatement(args: {
    statementId: string;
    bucket: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
  }): Promise<string> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const statement = await tx.statement.findUnique({
        where: {
          id: args.statementId,
        },
        select: {
          id: true,
          generatedFileId: true,
        },
      });

      if (!statement) {
        throw new Error(`Statement ${args.statementId} was not found.`);
      }

      if (statement.generatedFileId) {
        return statement.generatedFileId;
      }

      const uploadedFile = await tx.uploadedFile.create({
        data: {
          fileKind: "GENERATED_STATEMENT",
          bucket: args.bucket,
          storagePath: args.storagePath,
          originalFilename: args.originalFilename,
          mimeType: args.mimeType,
          sizeBytes: BigInt(args.sizeBytes),
          checksumSha256: args.checksumSha256,
          uploadedByUserId: null,
        },
        select: {
          id: true,
        },
      });

      await tx.statement.update({
        where: {
          id: statement.id,
        },
        data: {
          generatedFileId: uploadedFile.id,
        },
      });

      return uploadedFile.id;
    });
  }

  async markStatementGenerationFailed(
    statementTaskId: string,
    cycleId: string,
    errorMessage: string,
  ): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingStatementCount = await tx.statement.count({
        where: { cycleId },
      });

      await tx.statementTask.update({
        where: { id: statementTaskId },
        data: {
          status: "FAILED",
          lastError: errorMessage,
          completedAt: null,
        },
      });

      await tx.reconciliationCycle.update({
        where: { id: cycleId },
        data: {
          status:
            existingStatementCount > 0
              ? "STATEMENT_READY"
              : "STATEMENT_PENDING",
          lastError: errorMessage,
        },
      });
    });
  }
}
