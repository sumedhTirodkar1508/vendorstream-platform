import {
  prisma,
  type BatchSourceType,
  type CycleStatus,
  type ImportBatchStatus,
  type Prisma,
  type StatementTaskStatus,
} from "@vendorstream/database";

const RECENT_BATCH_LIMIT = 24;
const RECENT_CYCLE_LIMIT = 24;
const RECENT_STATEMENT_TASK_LIMIT = 24;
const MONTH_OPTIONS_LIMIT = 24;

function formatMonthParam(month: Date) {
  const year = month.getUTCFullYear();
  const monthValue = `${month.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${monthValue}`;
}

function parseMonthParam(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  return new Date(`${value}-01T00:00:00.000Z`);
}

function normalizeErrorMessage(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function extractErrorFromJsonValue(
  value: Prisma.JsonValue | null,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = normalizeErrorMessage(value);
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const extracted = extractErrorFromJsonValue(item);

      if (extracted) {
        return extracted;
      }
    }

    return null;
  }

  const objectValue = value as Record<string, Prisma.JsonValue>;
  const priorityKeys = [
    "error",
    "message",
    "reason",
    "detail",
    "details",
    "lastError",
    "errors",
  ];

  for (const key of priorityKeys) {
    const candidate = objectValue[key];

    if (candidate === undefined) {
      continue;
    }

    const extracted = extractErrorFromJsonValue(candidate);

    if (extracted) {
      return extracted;
    }
  }

  for (const candidate of Object.values(objectValue)) {
    const extracted = extractErrorFromJsonValue(candidate);

    if (extracted) {
      return extracted;
    }
  }

  return null;
}

function deriveBatchLastError({
  preValidationErrors,
  validationSummary,
  cycleLastError,
}: {
  preValidationErrors: Prisma.JsonValue | null;
  validationSummary: Prisma.JsonValue | null;
  cycleLastError: string | null;
}) {
  return (
    extractErrorFromJsonValue(preValidationErrors) ??
    extractErrorFromJsonValue(validationSummary) ??
    (cycleLastError ? normalizeErrorMessage(cycleLastError) : null)
  );
}

export type ProcessingBatchRow = {
  id: string;
  sourceType: BatchSourceType;
  status: ImportBatchStatus;
  fileName: string;
  totalRows: number | null;
  validRows: number | null;
  invalidRows: number | null;
  processedAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  cycle: {
    id: string;
    periodMonth: Date;
    status: CycleStatus;
    lpName: string;
    storeOrganizationName: string;
    storeLocationName: string;
  };
};

export type ProcessingCycleRow = {
  id: string;
  periodMonth: Date;
  status: CycleStatus;
  mismatchCount: number;
  updatedAt: Date;
  lastError: string | null;
  lpName: string;
  storeOrganizationName: string;
  storeLocationName: string;
  statementTask: {
    id: string;
    status: StatementTaskStatus;
    attemptCount: number;
    lastError: string | null;
  } | null;
};

export type ProcessingStatementTaskRow = {
  id: string;
  cycleId: string;
  periodMonth: Date;
  status: StatementTaskStatus;
  attemptCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  lpName: string;
  storeOrganizationName: string;
  storeLocationName: string;
};

export type AdminProcessingMonitorData = {
  filters: AdminProcessingMonitorFilters;
  monthOptions: string[];
  recentBatches: ProcessingBatchRow[];
  recentCycles: ProcessingCycleRow[];
  recentStatementTasks: ProcessingStatementTaskRow[];
};

export type AdminProcessingMonitorFilters = {
  month: string;
  batchStatus: string;
  cycleStatus: string;
  statementTaskStatus: string;
};

const IMPORT_BATCH_STATUS_OPTIONS: ImportBatchStatus[] = [
  "RECEIVED",
  "PREVALIDATION_FAILED",
  "VALIDATING",
  "VALIDATION_FAILED",
  "STAGED",
  "WAITING_FOR_COUNTERPART",
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
  "RECONCILED",
  "FAILED",
  "CANCELED",
];

const CYCLE_STATUS_OPTIONS: CycleStatus[] = [
  "AWAITING_UPLOADS",
  "PROCESSING",
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
  "MISMATCHES_FOUND",
  "RECONCILIATION_PASSED",
  "STATEMENT_PENDING",
  "STATEMENT_GENERATING",
  "STATEMENT_READY",
  "FAILED",
];

const STATEMENT_TASK_STATUS_OPTIONS: StatementTaskStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELED",
];

export async function getAdminProcessingMonitorData(
  inputFilters: AdminProcessingMonitorFilters,
): Promise<AdminProcessingMonitorData> {
  const monthFilter = parseMonthParam(inputFilters.month);
  const batchStatusFilter = IMPORT_BATCH_STATUS_OPTIONS.includes(
    inputFilters.batchStatus as ImportBatchStatus,
  )
    ? (inputFilters.batchStatus as ImportBatchStatus)
    : undefined;
  const cycleStatusFilter = CYCLE_STATUS_OPTIONS.includes(
    inputFilters.cycleStatus as CycleStatus,
  )
    ? (inputFilters.cycleStatus as CycleStatus)
    : undefined;
  const statementTaskStatusFilter = STATEMENT_TASK_STATUS_OPTIONS.includes(
    inputFilters.statementTaskStatus as StatementTaskStatus,
  )
    ? (inputFilters.statementTaskStatus as StatementTaskStatus)
    : undefined;

  const filters: AdminProcessingMonitorFilters = {
    month: monthFilter ? inputFilters.month : "",
    batchStatus: batchStatusFilter ?? "",
    cycleStatus: cycleStatusFilter ?? "",
    statementTaskStatus: statementTaskStatusFilter ?? "",
  };

  const [recentBatches, recentCycles, recentStatementTasks, monthRows] =
    await Promise.all([
      prisma.importBatch.findMany({
        where: {
          ...(batchStatusFilter ? { status: batchStatusFilter } : {}),
          ...(monthFilter
            ? {
                cycle: {
                  periodMonth: monthFilter,
                },
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }],
        take: RECENT_BATCH_LIMIT,
        select: {
          id: true,
          sourceType: true,
          status: true,
          totalRowCount: true,
          validRowCount: true,
          invalidRowCount: true,
          processedAt: true,
          failedAt: true,
          preValidationErrors: true,
          validationSummary: true,
          uploadedFile: {
            select: {
              originalFilename: true,
            },
          },
          cycle: {
            select: {
              id: true,
              periodMonth: true,
              status: true,
              lastError: true,
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
          _count: {
            select: {
              rawLpRows: true,
              rawStoreRows: true,
              normalizedLpRows: true,
              normalizedStoreRows: true,
            },
          },
        },
      }),
      prisma.reconciliationCycle.findMany({
        where: {
          ...(cycleStatusFilter ? { status: cycleStatusFilter } : {}),
          ...(monthFilter ? { periodMonth: monthFilter } : {}),
        },
        orderBy: [{ updatedAt: "desc" }],
        take: RECENT_CYCLE_LIMIT,
        select: {
          id: true,
          periodMonth: true,
          status: true,
          updatedAt: true,
          lastError: true,
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
          statementTasks: {
            orderBy: [{ createdAt: "desc" }],
            take: 1,
            select: {
              id: true,
              status: true,
              attemptCount: true,
              lastError: true,
            },
          },
          _count: {
            select: {
              mismatches: true,
            },
          },
        },
      }),
      prisma.statementTask.findMany({
        where: {
          ...(statementTaskStatusFilter
            ? { status: statementTaskStatusFilter }
            : {}),
          ...(monthFilter
            ? {
                cycle: {
                  periodMonth: monthFilter,
                },
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }],
        take: RECENT_STATEMENT_TASK_LIMIT,
        select: {
          id: true,
          cycleId: true,
          status: true,
          attemptCount: true,
          startedAt: true,
          completedAt: true,
          lastError: true,
          cycle: {
            select: {
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
        },
      }),
      prisma.reconciliationCycle.findMany({
        select: {
          periodMonth: true,
        },
        distinct: ["periodMonth"],
        orderBy: [{ periodMonth: "desc" }],
        take: MONTH_OPTIONS_LIMIT,
      }),
    ]);

  return {
    filters,
    monthOptions: monthRows.map((row) => formatMonthParam(row.periodMonth)),
    recentBatches: recentBatches.map((batch) => {
      const fallbackTotalRows =
        batch.sourceType === "LP"
          ? batch._count.rawLpRows
          : batch._count.rawStoreRows;
      const fallbackValidRows =
        batch.sourceType === "LP"
          ? batch._count.normalizedLpRows
          : batch._count.normalizedStoreRows;

      const totalRows = batch.totalRowCount ?? fallbackTotalRows;
      const validRows = batch.validRowCount ?? fallbackValidRows;
      const invalidRows =
        batch.invalidRowCount ??
        (totalRows !== null && validRows !== null
          ? Math.max(totalRows - validRows, 0)
          : null);

      return {
        id: batch.id,
        sourceType: batch.sourceType,
        status: batch.status,
        fileName: batch.uploadedFile.originalFilename,
        totalRows,
        validRows,
        invalidRows,
        processedAt: batch.processedAt,
        failedAt: batch.failedAt,
        lastError: deriveBatchLastError({
          preValidationErrors: batch.preValidationErrors,
          validationSummary: batch.validationSummary,
          cycleLastError: batch.cycle.lastError,
        }),
        cycle: {
          id: batch.cycle.id,
          periodMonth: batch.cycle.periodMonth,
          status: batch.cycle.status,
          lpName: batch.cycle.lp.name,
          storeOrganizationName:
            batch.cycle.storeLocation.storeOrganization.name,
          storeLocationName: batch.cycle.storeLocation.name,
        },
      };
    }),
    recentCycles: recentCycles.map((cycle) => ({
      id: cycle.id,
      periodMonth: cycle.periodMonth,
      status: cycle.status,
      mismatchCount: cycle._count.mismatches,
      updatedAt: cycle.updatedAt,
      lastError: cycle.lastError,
      lpName: cycle.lp.name,
      storeOrganizationName: cycle.storeLocation.storeOrganization.name,
      storeLocationName: cycle.storeLocation.name,
      statementTask:
        cycle.statementTasks[0] === undefined
          ? null
          : {
              id: cycle.statementTasks[0].id,
              status: cycle.statementTasks[0].status,
              attemptCount: cycle.statementTasks[0].attemptCount,
              lastError: cycle.statementTasks[0].lastError,
            },
    })),
    recentStatementTasks: recentStatementTasks.map((task) => ({
      id: task.id,
      cycleId: task.cycleId,
      periodMonth: task.cycle.periodMonth,
      status: task.status,
      attemptCount: task.attemptCount,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      lastError: task.lastError,
      lpName: task.cycle.lp.name,
      storeOrganizationName: task.cycle.storeLocation.storeOrganization.name,
      storeLocationName: task.cycle.storeLocation.name,
    })),
  };
}
