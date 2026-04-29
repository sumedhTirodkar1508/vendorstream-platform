import "server-only";

import {
  prisma,
  recordAuditLog,
  type CycleStatus,
  type LpMembershipRole,
  type StatementTaskStatus,
  type SystemRole,
} from "@vendorstream/database";
import {
  enqueueGenerateStatementJob,
  enqueueProcessImportBatchJob,
  enqueueReconcileCycleJob,
} from "@/lib/queue/producer";
import {
  canRetryCycle,
  canRetryImportBatch,
  canRetryStatementTask,
  RECONCILABLE_CURRENT_BATCH_STATUSES,
  RETRYABLE_CYCLE_STATUSES,
  RETRYABLE_IMPORT_BATCH_STATUSES,
  RETRYABLE_STATEMENT_TASK_STATUSES,
} from "@/lib/processing-retry-rules";

type RetryResultStatus =
  | "ENQUEUED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "QUEUE_FAILED"
  | "INVALID";

type RetryActor = {
  userId: string;
  systemRole?: SystemRole;
};

export type RetryImportBatchResult = {
  status: RetryResultStatus;
  batchId: string | null;
  cycleId: string | null;
};

export type RetryCycleReconciliationResult = {
  status: RetryResultStatus;
  cycleId: string | null;
};

export type RetryStatementTaskResult = {
  status: RetryResultStatus;
  statementTaskId: string | null;
  cycleId: string | null;
};

const MANAGEABLE_LP_ROLES: LpMembershipRole[] = ["LP_ADMIN", "LP_MANAGER"];
const IN_PROGRESS_TASK_STATUSES: StatementTaskStatus[] = [
  "PENDING",
  "PROCESSING",
];

function getPeriodMonthParam(value: Date) {
  return value.toISOString().slice(0, 7);
}

function isAdmin(actor: RetryActor) {
  return actor.systemRole === "ADMIN";
}

async function canManageLpProcessing(args: {
  actor: RetryActor;
  lpId: string;
}) {
  if (isAdmin(args.actor)) {
    return true;
  }

  const membership = await prisma.lpMembership.findFirst({
    where: {
      userId: args.actor.userId,
      lpId: args.lpId,
      role: {
        in: MANAGEABLE_LP_ROLES,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(membership);
}

export async function retryImportBatchProcessing(args: {
  importBatchId: string;
  actor: RetryActor;
}): Promise<RetryImportBatchResult> {
  const importBatchId = args.importBatchId.trim();

  if (!importBatchId || !args.actor.userId) {
    return {
      status: "INVALID",
      batchId: null,
      cycleId: null,
    };
  }

  const existingBatch = await prisma.importBatch.findUnique({
    where: {
      id: importBatchId,
    },
    select: {
      id: true,
      cycleId: true,
      uploadedFileId: true,
      sourceType: true,
      isCurrent: true,
      status: true,
      cycle: {
        select: {
          id: true,
          lpId: true,
          storeLocationId: true,
          periodMonth: true,
          status: true,
          lastError: true,
        },
      },
    },
  });

  if (!existingBatch) {
    return {
      status: "NOT_FOUND",
      batchId: null,
      cycleId: null,
    };
  }

  const canManage = await canManageLpProcessing({
    actor: args.actor,
    lpId: existingBatch.cycle.lpId,
  });

  if (!canManage) {
    return {
      status: "FORBIDDEN",
      batchId: existingBatch.id,
      cycleId: existingBatch.cycleId,
    };
  }

  if (!canRetryImportBatch(existingBatch.status)) {
    return {
      status: "NOT_ELIGIBLE",
      batchId: existingBatch.id,
      cycleId: existingBatch.cycleId,
    };
  }

  const claim = await prisma.$transaction(async (tx) => {
    const current = await tx.importBatch.findUnique({
      where: {
        id: importBatchId,
      },
      select: {
        id: true,
        cycleId: true,
        uploadedFileId: true,
        sourceType: true,
        isCurrent: true,
        status: true,
        cycle: {
          select: {
            id: true,
            lpId: true,
            storeLocationId: true,
            periodMonth: true,
            status: true,
            lastError: true,
          },
        },
      },
    });

    if (!current) {
      return {
        kind: "NOT_FOUND" as const,
      };
    }

    if (
      !RETRYABLE_IMPORT_BATCH_STATUSES.includes(current.status)
    ) {
      return {
        kind: "NOT_ELIGIBLE" as const,
        batchId: current.id,
        cycleId: current.cycleId,
      };
    }

    const updated = await tx.importBatch.updateMany({
      where: {
        id: current.id,
        status: {
          in: RETRYABLE_IMPORT_BATCH_STATUSES,
        },
      },
      data: {
        status: "RECEIVED",
      },
    });

    if (updated.count === 0) {
      return {
        kind: "NOT_ELIGIBLE" as const,
        batchId: current.id,
        cycleId: current.cycleId,
      };
    }

    await tx.reconciliationCycle.update({
      where: {
        id: current.cycle.id,
      },
      data: {
        status: "PROCESSING",
        lastError: null,
      },
    });

    await recordAuditLog(tx, {
      actorType: "USER",
      actorUserId: args.actor.userId,
      action: "import_batch.reprocess_requested",
      entityType: "IMPORT_BATCH",
      entityId: current.id,
      cycleId: current.cycle.id,
      batchId: current.id,
      metadata: {
        sourceType: current.sourceType,
        previousBatchStatus: current.status,
        previousCycleStatus: current.cycle.status,
      },
    });

    return {
      kind: "CLAIMED" as const,
      batchId: current.id,
      cycleId: current.cycleId,
      previousBatchStatus: current.status,
      previousCycleStatus: current.cycle.status,
      previousCycleLastError: current.cycle.lastError,
      payload: {
        importBatchId: current.id,
        cycleId: current.cycle.id,
        uploadedFileId: current.uploadedFileId,
        uploadedByUserId: args.actor.userId,
        sourceType: current.sourceType,
        lpId: current.cycle.lpId,
        storeLocationId: current.cycle.storeLocationId,
        periodMonth: getPeriodMonthParam(current.cycle.periodMonth),
      },
    };
  });

  if (claim.kind === "NOT_FOUND") {
    return {
      status: "NOT_FOUND",
      batchId: null,
      cycleId: null,
    };
  }

  if (claim.kind === "NOT_ELIGIBLE") {
    return {
      status: "NOT_ELIGIBLE",
      batchId: claim.batchId,
      cycleId: claim.cycleId,
    };
  }

  const enqueueResult = await enqueueProcessImportBatchJob(claim.payload);

  if (enqueueResult.status !== "ENQUEUED") {
    await prisma.$transaction([
      prisma.importBatch.updateMany({
        where: {
          id: claim.batchId,
          status: "RECEIVED",
        },
        data: {
          status: claim.previousBatchStatus,
        },
      }),
      prisma.reconciliationCycle.update({
        where: {
          id: claim.cycleId,
        },
        data: {
          status: claim.previousCycleStatus,
          lastError: claim.previousCycleLastError,
        },
      }),
    ]);

    return {
      status: "QUEUE_FAILED",
      batchId: claim.batchId,
      cycleId: claim.cycleId,
    };
  }

  return {
    status: "ENQUEUED",
    batchId: claim.batchId,
    cycleId: claim.cycleId,
  };
}

export async function retryCycleReconciliation(args: {
  cycleId: string;
  actor: RetryActor;
}): Promise<RetryCycleReconciliationResult> {
  const cycleId = args.cycleId.trim();

  if (!cycleId || !args.actor.userId) {
    return {
      status: "INVALID",
      cycleId: null,
    };
  }

  const existingCycle = await prisma.reconciliationCycle.findUnique({
    where: {
      id: cycleId,
    },
    select: {
      id: true,
      lpId: true,
      storeLocationId: true,
      periodMonth: true,
      status: true,
      lastError: true,
      importBatches: {
        where: {
          isCurrent: true,
        },
        select: {
          sourceType: true,
          status: true,
        },
      },
    },
  });

  if (!existingCycle) {
    return {
      status: "NOT_FOUND",
      cycleId: null,
    };
  }

  const canManage = await canManageLpProcessing({
    actor: args.actor,
    lpId: existingCycle.lpId,
  });

  if (!canManage) {
    return {
      status: "FORBIDDEN",
      cycleId: existingCycle.id,
    };
  }

  const lpBatch = existingCycle.importBatches.find(
    (batch) => batch.sourceType === "LP",
  );
  const storeBatch = existingCycle.importBatches.find(
    (batch) => batch.sourceType === "STORE",
  );

  const isReconciliationReady =
    lpBatch &&
    storeBatch &&
    RECONCILABLE_CURRENT_BATCH_STATUSES.includes(lpBatch.status) &&
    RECONCILABLE_CURRENT_BATCH_STATUSES.includes(storeBatch.status);

  if (!canRetryCycle(existingCycle.status) || !isReconciliationReady) {
    return {
      status: "NOT_ELIGIBLE",
      cycleId: existingCycle.id,
    };
  }

  const claim = await prisma.$transaction(async (tx) => {
    const current = await tx.reconciliationCycle.findUnique({
      where: {
        id: cycleId,
      },
      select: {
        id: true,
        lpId: true,
        storeLocationId: true,
        periodMonth: true,
        status: true,
        lastError: true,
        importBatches: {
          where: {
            isCurrent: true,
          },
          select: {
            sourceType: true,
            status: true,
          },
        },
      },
    });

    if (!current) {
      return {
        kind: "NOT_FOUND" as const,
      };
    }

    const currentLpBatch = current.importBatches.find(
      (batch) => batch.sourceType === "LP",
    );
    const currentStoreBatch = current.importBatches.find(
      (batch) => batch.sourceType === "STORE",
    );

    const currentReconciliationReady =
      currentLpBatch &&
      currentStoreBatch &&
      RECONCILABLE_CURRENT_BATCH_STATUSES.includes(currentLpBatch.status) &&
      RECONCILABLE_CURRENT_BATCH_STATUSES.includes(currentStoreBatch.status);

    if (
      !RETRYABLE_CYCLE_STATUSES.includes(current.status) ||
      !currentReconciliationReady
    ) {
      return {
        kind: "NOT_ELIGIBLE" as const,
        cycleId: current.id,
      };
    }

    const updated = await tx.reconciliationCycle.updateMany({
      where: {
        id: current.id,
        status: {
          in: RETRYABLE_CYCLE_STATUSES,
        },
      },
      data: {
        status: "RECONCILING",
        lastError: null,
      },
    });

    if (updated.count === 0) {
      return {
        kind: "NOT_ELIGIBLE" as const,
        cycleId: current.id,
      };
    }

    return {
      kind: "CLAIMED" as const,
      cycleId: current.id,
      previousCycleStatus: current.status,
      previousCycleLastError: current.lastError,
      payload: {
        cycleId: current.id,
        lpId: current.lpId,
        storeLocationId: current.storeLocationId,
        periodMonth: getPeriodMonthParam(current.periodMonth),
      },
    };
  });

  if (claim.kind === "NOT_FOUND") {
    return {
      status: "NOT_FOUND",
      cycleId: null,
    };
  }

  if (claim.kind === "NOT_ELIGIBLE") {
    return {
      status: "NOT_ELIGIBLE",
      cycleId: claim.cycleId,
    };
  }

  const enqueueResult = await enqueueReconcileCycleJob(claim.payload);

  if (enqueueResult.status !== "ENQUEUED") {
    await prisma.reconciliationCycle.update({
      where: {
        id: claim.cycleId,
      },
      data: {
        status: claim.previousCycleStatus,
        lastError: claim.previousCycleLastError,
      },
    });

    return {
      status: "QUEUE_FAILED",
      cycleId: claim.cycleId,
    };
  }

  return {
    status: "ENQUEUED",
    cycleId: claim.cycleId,
  };
}

export async function retryStatementTaskGeneration(args: {
  statementTaskId: string;
  actor: RetryActor;
}): Promise<RetryStatementTaskResult> {
  const statementTaskId = args.statementTaskId.trim();

  if (!statementTaskId || !args.actor.userId) {
    return {
      status: "INVALID",
      statementTaskId: null,
      cycleId: null,
    };
  }

  if (!isAdmin(args.actor)) {
    return {
      status: "FORBIDDEN",
      statementTaskId,
      cycleId: null,
    };
  }

  const existingTask = await prisma.statementTask.findUnique({
    where: {
      id: statementTaskId,
    },
    select: {
      id: true,
      cycleId: true,
      status: true,
      lastError: true,
      startedAt: true,
      completedAt: true,
      cycle: {
        select: {
          status: true,
          lastError: true,
        },
      },
    },
  });

  if (!existingTask) {
    return {
      status: "NOT_FOUND",
      statementTaskId: null,
      cycleId: null,
    };
  }

  if (!canRetryStatementTask(existingTask.status)) {
    return {
      status: "NOT_ELIGIBLE",
      statementTaskId: existingTask.id,
      cycleId: existingTask.cycleId,
    };
  }

  const claim = await prisma.$transaction(async (tx) => {
    const currentTask = await tx.statementTask.findUnique({
      where: {
        id: statementTaskId,
      },
      select: {
        id: true,
        cycleId: true,
        status: true,
        lastError: true,
        startedAt: true,
        completedAt: true,
        cycle: {
          select: {
            status: true,
            lastError: true,
          },
        },
      },
    });

    if (!currentTask) {
      return {
        kind: "NOT_FOUND" as const,
      };
    }

    if (!RETRYABLE_STATEMENT_TASK_STATUSES.includes(currentTask.status)) {
      return {
        kind: "NOT_ELIGIBLE" as const,
        statementTaskId: currentTask.id,
        cycleId: currentTask.cycleId,
      };
    }

    const inProgressTasks = await tx.statementTask.count({
      where: {
        cycleId: currentTask.cycleId,
        id: {
          not: currentTask.id,
        },
        status: {
          in: IN_PROGRESS_TASK_STATUSES,
        },
      },
    });

    if (inProgressTasks > 0) {
      return {
        kind: "NOT_ELIGIBLE" as const,
        statementTaskId: currentTask.id,
        cycleId: currentTask.cycleId,
      };
    }

    const updated = await tx.statementTask.updateMany({
      where: {
        id: currentTask.id,
        status: {
          in: RETRYABLE_STATEMENT_TASK_STATUSES,
        },
      },
      data: {
        status: "PENDING",
        requestedByUserId: args.actor.userId,
        lastError: null,
        startedAt: null,
        completedAt: null,
      },
    });

    if (updated.count === 0) {
      return {
        kind: "NOT_ELIGIBLE" as const,
        statementTaskId: currentTask.id,
        cycleId: currentTask.cycleId,
      };
    }

    await tx.reconciliationCycle.update({
      where: {
        id: currentTask.cycleId,
      },
      data: {
        status: "STATEMENT_PENDING",
        lastError: null,
      },
    });

    return {
      kind: "CLAIMED" as const,
      statementTaskId: currentTask.id,
      cycleId: currentTask.cycleId,
      previousTaskStatus: currentTask.status,
      previousTaskLastError: currentTask.lastError,
      previousTaskStartedAt: currentTask.startedAt,
      previousTaskCompletedAt: currentTask.completedAt,
      previousCycleStatus: currentTask.cycle.status,
      previousCycleLastError: currentTask.cycle.lastError,
      payload: {
        statementTaskId: currentTask.id,
        cycleId: currentTask.cycleId,
      },
    };
  });

  if (claim.kind === "NOT_FOUND") {
    return {
      status: "NOT_FOUND",
      statementTaskId: null,
      cycleId: null,
    };
  }

  if (claim.kind === "NOT_ELIGIBLE") {
    return {
      status: "NOT_ELIGIBLE",
      statementTaskId: claim.statementTaskId,
      cycleId: claim.cycleId,
    };
  }

  const enqueueResult = await enqueueGenerateStatementJob(claim.payload);

  if (enqueueResult.status !== "ENQUEUED") {
    await prisma.$transaction([
      prisma.statementTask.updateMany({
        where: {
          id: claim.statementTaskId,
          status: "PENDING",
        },
        data: {
          status: claim.previousTaskStatus,
          lastError: claim.previousTaskLastError,
          startedAt: claim.previousTaskStartedAt,
          completedAt: claim.previousTaskCompletedAt,
          requestedByUserId: null,
        },
      }),
      prisma.reconciliationCycle.update({
        where: {
          id: claim.cycleId,
        },
        data: {
          status: claim.previousCycleStatus as CycleStatus,
          lastError: claim.previousCycleLastError,
        },
      }),
    ]);

    return {
      status: "QUEUE_FAILED",
      statementTaskId: claim.statementTaskId,
      cycleId: claim.cycleId,
    };
  }

  return {
    status: "ENQUEUED",
    statementTaskId: claim.statementTaskId,
    cycleId: claim.cycleId,
  };
}
