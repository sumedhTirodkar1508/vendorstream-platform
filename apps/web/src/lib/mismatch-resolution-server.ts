import "server-only";

import {
  prisma,
  Prisma,
  type SystemRole,
  type $Enums,
} from "@vendorstream/database";
import { enqueueGenerateStatementJob } from "@/lib/queue/producer";
import { getStoreUploadContextForUser } from "@/lib/store-upload-context";

type ResolutionWorkspace = "LP" | "STORE";

type ResolveMismatchRequest = {
  mismatchId: string;
  action: $Enums.ResolutionAction;
  actor: {
    userId: string;
    systemRole?: SystemRole;
  };
  workspace: ResolutionWorkspace;
  comment?: string | null;
  payloadJson?: string | null;
};

type ResolveMismatchSuccess = {
  status: "success";
  cycleId: string;
  mismatchId: string;
  mismatchStatus: $Enums.MismatchStatus;
  action: $Enums.ResolutionAction;
  nextTab: "open" | "resolved" | "waived";
};

type ResolveMismatchFailure = {
  status:
    | "invalid"
    | "invalid_payload"
    | "forbidden"
    | "not_found"
    | "already_closed"
    | "error";
  cycleId: string | null;
  mismatchId: string | null;
};

export type ResolveMismatchResult =
  | ResolveMismatchSuccess
  | ResolveMismatchFailure;

const MUTATING_ACTIONS = new Set<$Enums.ResolutionAction>([
  "ACCEPT_LP",
  "ACCEPT_STORE",
  "MANUAL_OVERRIDE",
  "WAIVE",
]);

const VALUE_SELECTING_ACTIONS = new Set<$Enums.ResolutionAction>([
  "ACCEPT_LP",
  "ACCEPT_STORE",
  "MANUAL_OVERRIDE",
]);

const STATEMENT_TASK_ELIGIBLE_CYCLE_STATUSES: $Enums.CycleStatus[] = [
  "RECONCILIATION_PASSED",
  "STATEMENT_PENDING",
  "STATEMENT_GENERATING",
  "STATEMENT_READY",
];

const LP_MANAGEABLE_ROLES: $Enums.LpMembershipRole[] = [
  "LP_ADMIN",
  "LP_MANAGER",
];

const STORE_MANAGEABLE_ROLES: $Enums.StoreOrgMembershipRole[] = [
  "STORE_ORG_ADMIN",
  "STORE_ORG_MANAGER",
];

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundTo(value: number, scale: number): number {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

function asJsonObject(
  value: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return numeric;
}

function pickFirstNonNegativeNumber(values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseNonNegativeNumber(value);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function deriveLpUnitPrice(
  lpSalesAmount: unknown,
  lpSalesUnits: unknown,
): number | null {
  const amount = decimalToNumber(lpSalesAmount);
  const units = decimalToNumber(lpSalesUnits);

  if (amount === null || units === null || units <= 0) {
    return null;
  }

  return roundTo(amount / units, 6);
}

type EffectiveProjection = {
  effectiveStatus: "MATCHED" | "WAIVED";
  action: $Enums.ResolutionAction;
  resolutionId: string;
  mismatchId: string;
  createdByUserId: string;
  createdAt: Date;
  effectiveValues: {
    reconciledUnits: number | null;
    unitPrice: number | null;
    reconciledUnitsSource: "LP" | "STORE" | "MANUAL_OVERRIDE" | "NONE";
    unitPriceSource:
      | "LP_DERIVED"
      | "STORE_DERIVED"
      | "MANUAL_OVERRIDE"
      | "NONE";
  };
  manualOverridePayload: Prisma.JsonValue | null;
};

type ResultResolutionMismatchRow = {
  id: string;
  status: $Enums.MismatchStatus;
  resolutions: Array<{
    id: string;
    action: $Enums.ResolutionAction;
    payload: Prisma.JsonValue;
    createdAt: Date;
    createdByUserId: string;
  }>;
};

function sortByCreatedAtDescending<T extends { createdAt: Date }>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}

function buildEffectiveProjection(args: {
  action: $Enums.ResolutionAction;
  payload: Prisma.JsonValue | null;
  resolutionId: string;
  mismatchId: string;
  createdByUserId: string;
  createdAt: Date;
  result: {
    lpSalesAmount: Prisma.Decimal | null;
    lpSalesUnits: Prisma.Decimal | null;
    storeSalesUnits: Prisma.Decimal | null;
    chosenUnitPrice: Prisma.Decimal | null;
  };
}): EffectiveProjection {
  const lpUnits = decimalToNumber(args.result.lpSalesUnits);
  const storeUnits = decimalToNumber(args.result.storeSalesUnits);
  const storeUnitPrice = decimalToNumber(args.result.chosenUnitPrice);
  const lpDerivedUnitPrice = deriveLpUnitPrice(
    args.result.lpSalesAmount,
    args.result.lpSalesUnits,
  );

  if (args.action === "WAIVE") {
    return {
      effectiveStatus: "WAIVED",
      action: args.action,
      resolutionId: args.resolutionId,
      mismatchId: args.mismatchId,
      createdByUserId: args.createdByUserId,
      createdAt: args.createdAt,
      effectiveValues: {
        reconciledUnits: null,
        unitPrice: null,
        reconciledUnitsSource: "NONE",
        unitPriceSource: "NONE",
      },
      manualOverridePayload: null,
    };
  }

  if (args.action === "ACCEPT_LP") {
    return {
      effectiveStatus: "MATCHED",
      action: args.action,
      resolutionId: args.resolutionId,
      mismatchId: args.mismatchId,
      createdByUserId: args.createdByUserId,
      createdAt: args.createdAt,
      effectiveValues: {
        reconciledUnits: lpUnits ?? storeUnits,
        unitPrice: lpDerivedUnitPrice ?? storeUnitPrice,
        reconciledUnitsSource: lpUnits !== null ? "LP" : "STORE",
        unitPriceSource:
          lpDerivedUnitPrice !== null ? "LP_DERIVED" : "STORE_DERIVED",
      },
      manualOverridePayload: null,
    };
  }

  if (args.action === "ACCEPT_STORE") {
    return {
      effectiveStatus: "MATCHED",
      action: args.action,
      resolutionId: args.resolutionId,
      mismatchId: args.mismatchId,
      createdByUserId: args.createdByUserId,
      createdAt: args.createdAt,
      effectiveValues: {
        reconciledUnits: storeUnits ?? lpUnits,
        unitPrice: storeUnitPrice ?? lpDerivedUnitPrice,
        reconciledUnitsSource: storeUnits !== null ? "STORE" : "LP",
        unitPriceSource:
          storeUnitPrice !== null ? "STORE_DERIVED" : "LP_DERIVED",
      },
      manualOverridePayload: null,
    };
  }

  const payloadObject = asJsonObject(args.payload);
  const payloadEffectiveValues = asJsonObject(
    payloadObject?.effectiveValues as Prisma.JsonValue,
  );

  const manualUnits = pickFirstNonNegativeNumber([
    payloadEffectiveValues?.reconciledUnits,
    payloadEffectiveValues?.resolvedUnits,
    payloadEffectiveValues?.units,
    payloadObject?.reconciledUnits,
    payloadObject?.resolvedUnits,
    payloadObject?.units,
  ]);

  const manualUnitPrice = pickFirstNonNegativeNumber([
    payloadEffectiveValues?.unitPrice,
    payloadEffectiveValues?.chosenUnitPrice,
    payloadObject?.unitPrice,
    payloadObject?.chosenUnitPrice,
  ]);

  return {
    effectiveStatus: "MATCHED",
    action: args.action,
    resolutionId: args.resolutionId,
    mismatchId: args.mismatchId,
    createdByUserId: args.createdByUserId,
    createdAt: args.createdAt,
    effectiveValues: {
      reconciledUnits: manualUnits ?? storeUnits ?? lpUnits,
      unitPrice: manualUnitPrice ?? storeUnitPrice ?? lpDerivedUnitPrice,
      reconciledUnitsSource:
        manualUnits !== null
          ? "MANUAL_OVERRIDE"
          : storeUnits !== null
            ? "STORE"
            : "LP",
      unitPriceSource:
        manualUnitPrice !== null
          ? "MANUAL_OVERRIDE"
          : storeUnitPrice !== null
            ? "STORE_DERIVED"
            : "LP_DERIVED",
    },
    manualOverridePayload:
      args.action === "MANUAL_OVERRIDE" ? args.payload : null,
  };
}

function mergeResolutionProjectionIntoDetails(args: {
  existingDetails: Prisma.JsonValue | null;
  previousStatus: $Enums.ReconciliationStatus;
  nextStatus: $Enums.ReconciliationStatus;
  projection: EffectiveProjection;
  hasOpenBlockingMismatches: boolean;
  actorUserId: string;
  appliedAt: Date;
}): Prisma.InputJsonValue {
  const detailsObject = asJsonObject(args.existingDetails) ?? {};
  const currentProjection = asJsonObject(
    detailsObject.resolutionProjection as Prisma.JsonValue,
  );
  const existingHistory = Array.isArray(
    detailsObject.resolutionProjectionHistory,
  )
    ? detailsObject.resolutionProjectionHistory
    : [];
  const nextHistory = [...existingHistory];

  if (currentProjection) {
    nextHistory.push({
      supersededAt: args.appliedAt.toISOString(),
      supersededByUserId: args.actorUserId,
      ...currentProjection,
    });
  }

  const cappedHistory =
    nextHistory.length > 25
      ? nextHistory.slice(nextHistory.length - 25)
      : nextHistory;

  const baseline = (asJsonObject(
    detailsObject.resolutionProjectionBaseline as Prisma.JsonValue,
  ) ?? {
    capturedAt: args.appliedAt.toISOString(),
    originalResultStatus: args.previousStatus,
  }) as Prisma.InputJsonObject;

  return {
    ...detailsObject,
    resolutionProjectionBaseline: baseline,
    resolutionProjectionHistory: cappedHistory as Prisma.InputJsonArray,
    resolutionProjection: {
      effectiveStatus: args.projection.effectiveStatus,
      sourceResolutionAction: args.projection.action,
      sourceResolutionId: args.projection.resolutionId,
      sourceMismatchId: args.projection.mismatchId,
      appliedByUserId: args.projection.createdByUserId,
      appliedAt: args.projection.createdAt.toISOString(),
      hasOpenBlockingMismatches: args.hasOpenBlockingMismatches,
      resultStatusBeforeProjection: args.previousStatus,
      resultStatusAfterProjection: args.nextStatus,
      effectiveValues: {
        reconciledUnits: args.projection.effectiveValues.reconciledUnits,
        unitPrice: args.projection.effectiveValues.unitPrice,
        reconciledUnitsSource:
          args.projection.effectiveValues.reconciledUnitsSource,
        unitPriceSource: args.projection.effectiveValues.unitPriceSource,
      },
      manualOverridePayload: args.projection.manualOverridePayload,
    },
  } as Prisma.InputJsonObject;
}

function computeResultProjection(args: {
  result: {
    status: $Enums.ReconciliationStatus;
    lpSalesAmount: Prisma.Decimal | null;
    lpSalesUnits: Prisma.Decimal | null;
    storeSalesUnits: Prisma.Decimal | null;
    chosenUnitPrice: Prisma.Decimal | null;
  };
  mismatches: ResultResolutionMismatchRow[];
}): {
  nextStatus: $Enums.ReconciliationStatus;
  projection: EffectiveProjection;
  hasOpenBlockingMismatches: boolean;
} | null {
  const hasOpenBlockingMismatches = args.mismatches.some(
    (mismatch) => mismatch.status === "OPEN",
  );

  const latestResolutions = args.mismatches
    .map((mismatch) => {
      const resolution = mismatch.resolutions[0];

      if (!resolution) {
        return null;
      }

      return {
        mismatchId: mismatch.id,
        mismatchStatus: mismatch.status,
        ...resolution,
      };
    })
    .filter(
      (
        value,
      ): value is {
        mismatchId: string;
        mismatchStatus: $Enums.MismatchStatus;
        id: string;
        action: $Enums.ResolutionAction;
        payload: Prisma.JsonValue;
        createdAt: Date;
        createdByUserId: string;
      } => value !== null,
    );

  const closedResolutionRows = latestResolutions.filter(
    (row) => row.mismatchStatus !== "OPEN",
  );

  if (closedResolutionRows.length === 0) {
    return null;
  }

  const latestValueSelectingResolution = sortByCreatedAtDescending(
    closedResolutionRows.filter((row) =>
      VALUE_SELECTING_ACTIONS.has(row.action),
    ),
  )[0];

  if (latestValueSelectingResolution) {
    return {
      nextStatus: hasOpenBlockingMismatches ? args.result.status : "MATCHED",
      projection: buildEffectiveProjection({
        action: latestValueSelectingResolution.action,
        payload: latestValueSelectingResolution.payload,
        resolutionId: latestValueSelectingResolution.id,
        mismatchId: latestValueSelectingResolution.mismatchId,
        createdByUserId: latestValueSelectingResolution.createdByUserId,
        createdAt: latestValueSelectingResolution.createdAt,
        result: args.result,
      }),
      hasOpenBlockingMismatches,
    };
  }

  const latestWaiveResolution = sortByCreatedAtDescending(
    closedResolutionRows.filter((row) => row.action === "WAIVE"),
  )[0];

  if (!latestWaiveResolution) {
    return null;
  }

  return {
    nextStatus: hasOpenBlockingMismatches ? args.result.status : "WAIVED",
    projection: buildEffectiveProjection({
      action: latestWaiveResolution.action,
      payload: latestWaiveResolution.payload,
      resolutionId: latestWaiveResolution.id,
      mismatchId: latestWaiveResolution.mismatchId,
      createdByUserId: latestWaiveResolution.createdByUserId,
      createdAt: latestWaiveResolution.createdAt,
      result: args.result,
    }),
    hasOpenBlockingMismatches,
  };
}

async function ensurePendingStatementTaskForCycle(cycleId: string): Promise<{
  id: string;
  cycleId: string;
} | null> {
  return prisma.$transaction(async (tx) => {
    const cycle = await tx.reconciliationCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        status: true,
      },
    });

    if (
      !cycle ||
      !STATEMENT_TASK_ELIGIBLE_CYCLE_STATUSES.includes(cycle.status)
    ) {
      return null;
    }

    const processingTask = await tx.statementTask.findFirst({
      where: {
        cycleId,
        status: "PROCESSING",
      },
      select: {
        id: true,
      },
    });

    if (processingTask) {
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
      return existingPendingTask;
    }

    return tx.statementTask.create({
      data: {
        cycleId,
        status: "PENDING",
      },
      select: {
        id: true,
        cycleId: true,
      },
    });
  });
}

async function enqueueStatementGenerationFromResolution(args: {
  cycleId: string;
  actorUserId: string;
  mismatchId: string;
}): Promise<void> {
  const pendingTask = await ensurePendingStatementTaskForCycle(args.cycleId);

  if (!pendingTask) {
    return;
  }

  const enqueueResult = await enqueueGenerateStatementJob({
    statementTaskId: pendingTask.id,
    cycleId: pendingTask.cycleId,
  });

  if (enqueueResult.status === "ENQUEUED") {
    await prisma.$transaction([
      prisma.reconciliationCycle.update({
        where: { id: args.cycleId },
        data: {
          status: "STATEMENT_PENDING",
          lastError: null,
        },
      }),
      prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorUserId: args.actorUserId,
          action: "statement.generation.enqueued",
          entityType: "RECONCILIATION_CYCLE",
          entityId: args.cycleId,
          cycleId: args.cycleId,
          metadata: {
            mismatchId: args.mismatchId,
            statementTaskId: pendingTask.id,
            enqueueJobId: enqueueResult.jobId,
          },
        },
      }),
    ]);

    return;
  }

  await prisma.$transaction([
    prisma.statementTask.update({
      where: {
        id: pendingTask.id,
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        lastError: `Failed to enqueue generate-statement job: ${enqueueResult.error}`,
      },
    }),
    prisma.reconciliationCycle.update({
      where: { id: args.cycleId },
      data: {
        status: "RECONCILIATION_PASSED",
        lastError: `Statement enqueue failed: ${enqueueResult.error}`,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorUserId: args.actorUserId,
        action: "statement.generation.enqueue_failed",
        entityType: "RECONCILIATION_CYCLE",
        entityId: args.cycleId,
        cycleId: args.cycleId,
        metadata: {
          mismatchId: args.mismatchId,
          statementTaskId: pendingTask.id,
          enqueueStatus: enqueueResult.status,
          enqueueError: enqueueResult.error,
        },
      },
    }),
  ]);
}

function parseResolutionPayload(
  action: $Enums.ResolutionAction,
  payloadJson: string | null | undefined,
): { ok: true; value: Prisma.InputJsonValue | null } | { ok: false } {
  const normalizedPayload = normalizeOptionalText(payloadJson);

  if (!normalizedPayload) {
    return { ok: true, value: null };
  }

  try {
    const parsed = JSON.parse(normalizedPayload) as Prisma.InputJsonValue;

    if (action === "MANUAL_OVERRIDE") {
      return { ok: true, value: parsed };
    }

    return {
      ok: true,
      value: {
        submittedPayload: parsed,
      },
    };
  } catch {
    return { ok: false };
  }
}

async function canManageMismatchInWorkspace(args: {
  userId: string;
  systemRole?: SystemRole;
  workspace: ResolutionWorkspace;
  lpId: string;
  storeLocationId: string;
  storeOrganizationId: string;
}): Promise<boolean> {
  if (args.systemRole === "ADMIN") {
    return true;
  }

  if (args.workspace === "LP") {
    const membership = await prisma.lpMembership.findFirst({
      where: {
        userId: args.userId,
        lpId: args.lpId,
      },
      select: {
        role: true,
      },
    });

    return membership ? LP_MANAGEABLE_ROLES.includes(membership.role) : false;
  }

  const [membership, storeContext] = await Promise.all([
    prisma.storeOrgMembership.findFirst({
      where: {
        userId: args.userId,
        storeOrganizationId: args.storeOrganizationId,
      },
      select: {
        role: true,
      },
    }),
    getStoreUploadContextForUser({
      userId: args.userId,
      systemRole: args.systemRole,
    }),
  ]);

  const canManageByRole = membership
    ? STORE_MANAGEABLE_ROLES.includes(membership.role)
    : false;

  if (!canManageByRole) {
    return false;
  }

  return storeContext.options.some(
    (option) =>
      option.lpId === args.lpId &&
      option.storeLocationId === args.storeLocationId,
  );
}

export async function resolveMismatch(
  request: ResolveMismatchRequest,
): Promise<ResolveMismatchResult> {
  const mismatchId = request.mismatchId.trim();
  const comment = normalizeOptionalText(request.comment);

  if (!mismatchId) {
    return {
      status: "invalid",
      cycleId: null,
      mismatchId: null,
    };
  }

  const allowedActions: $Enums.ResolutionAction[] = [
    "ACCEPT_LP",
    "ACCEPT_STORE",
    "MANUAL_OVERRIDE",
    "WAIVE",
    "COMMENT_ONLY",
  ];

  if (!allowedActions.includes(request.action)) {
    return {
      status: "invalid",
      cycleId: null,
      mismatchId,
    };
  }

  if (request.action === "COMMENT_ONLY" && !comment) {
    return {
      status: "invalid",
      cycleId: null,
      mismatchId,
    };
  }

  if (
    request.action === "MANUAL_OVERRIDE" &&
    !comment &&
    !normalizeOptionalText(request.payloadJson)
  ) {
    return {
      status: "invalid",
      cycleId: null,
      mismatchId,
    };
  }

  const parsedPayload = parseResolutionPayload(
    request.action,
    request.payloadJson,
  );

  if (!parsedPayload.ok) {
    return {
      status: "invalid_payload",
      cycleId: null,
      mismatchId,
    };
  }

  try {
    const mismatch = await prisma.mismatch.findUnique({
      where: {
        id: mismatchId,
      },
      select: {
        id: true,
        cycleId: true,
        status: true,
        resolvedAt: true,
        resolvedByUserId: true,
        reconciliationResultId: true,
        cycle: {
          select: {
            id: true,
            status: true,
            lpId: true,
            storeLocationId: true,
            storeLocation: {
              select: {
                storeOrganizationId: true,
              },
            },
          },
        },
      },
    });

    if (!mismatch) {
      return {
        status: "not_found",
        cycleId: null,
        mismatchId,
      };
    }

    const canManage = await canManageMismatchInWorkspace({
      userId: request.actor.userId,
      systemRole: request.actor.systemRole,
      workspace: request.workspace,
      lpId: mismatch.cycle.lpId,
      storeLocationId: mismatch.cycle.storeLocationId,
      storeOrganizationId: mismatch.cycle.storeLocation.storeOrganizationId,
    });

    if (!canManage) {
      return {
        status: "forbidden",
        cycleId: mismatch.cycleId,
        mismatchId,
      };
    }

    if (MUTATING_ACTIONS.has(request.action) && mismatch.status !== "OPEN") {
      return {
        status: "already_closed",
        cycleId: mismatch.cycleId,
        mismatchId,
      };
    }

    const now = new Date();
    const nextMismatchStatus: $Enums.MismatchStatus =
      request.action === "WAIVE"
        ? "WAIVED"
        : request.action === "COMMENT_ONLY"
          ? mismatch.status
          : "RESOLVED";
    let didCycleTransitionToReconciliationPassed = false;
    let projectedResultStatusChange:
      | {
          reconciliationResultId: string;
          previousStatus: $Enums.ReconciliationStatus;
          nextStatus: $Enums.ReconciliationStatus;
          sourceAction: $Enums.ResolutionAction;
          hasOpenBlockingMismatches: boolean;
        }
      | undefined;

    await prisma.$transaction(async (tx) => {
      const createdResolution = await tx.mismatchResolution.create({
        data: {
          mismatchId: mismatch.id,
          createdByUserId: request.actor.userId,
          action: request.action,
          comment,
          payload: parsedPayload.value ?? Prisma.JsonNull,
        },
        select: {
          id: true,
          mismatchId: true,
          action: true,
          payload: true,
          createdAt: true,
          createdByUserId: true,
        },
      });

      await tx.mismatch.update({
        where: {
          id: mismatch.id,
        },
        data: {
          status: nextMismatchStatus,
          resolvedAt:
            request.action === "COMMENT_ONLY" ? mismatch.resolvedAt : now,
          resolvedByUserId:
            request.action === "COMMENT_ONLY"
              ? mismatch.resolvedByUserId
              : request.actor.userId,
        },
      });

      if (
        mismatch.reconciliationResultId &&
        MUTATING_ACTIONS.has(request.action)
      ) {
        const result = await tx.reconciliationResult.findUnique({
          where: {
            id: mismatch.reconciliationResultId,
          },
          select: {
            id: true,
            status: true,
            lpSalesAmount: true,
            lpSalesUnits: true,
            storeSalesUnits: true,
            chosenUnitPrice: true,
            details: true,
          },
        });

        if (result) {
          const linkedMismatches = await tx.mismatch.findMany({
            where: {
              reconciliationResultId: result.id,
            },
            select: {
              id: true,
              status: true,
              resolutions: {
                orderBy: [{ createdAt: "desc" }],
                take: 1,
                select: {
                  id: true,
                  action: true,
                  payload: true,
                  createdAt: true,
                  createdByUserId: true,
                },
              },
            },
          });

          const projection = computeResultProjection({
            result: {
              status: result.status,
              lpSalesAmount: result.lpSalesAmount,
              lpSalesUnits: result.lpSalesUnits,
              storeSalesUnits: result.storeSalesUnits,
              chosenUnitPrice: result.chosenUnitPrice,
            },
            mismatches: linkedMismatches,
          });

          if (projection) {
            await tx.reconciliationResult.update({
              where: {
                id: result.id,
              },
              data: {
                status: projection.nextStatus,
                details: mergeResolutionProjectionIntoDetails({
                  existingDetails: result.details,
                  previousStatus: result.status,
                  nextStatus: projection.nextStatus,
                  projection: projection.projection,
                  hasOpenBlockingMismatches:
                    projection.hasOpenBlockingMismatches,
                  actorUserId: request.actor.userId,
                  appliedAt: now,
                }),
              },
            });

            projectedResultStatusChange = {
              reconciliationResultId: result.id,
              previousStatus: result.status,
              nextStatus: projection.nextStatus,
              sourceAction: projection.projection.action,
              hasOpenBlockingMismatches: projection.hasOpenBlockingMismatches,
            };
          } else {
            await tx.reconciliationResult.update({
              where: {
                id: result.id,
              },
              data: {
                details: mergeResolutionProjectionIntoDetails({
                  existingDetails: result.details,
                  previousStatus: result.status,
                  nextStatus: result.status,
                  projection: buildEffectiveProjection({
                    action: createdResolution.action,
                    payload: createdResolution.payload,
                    resolutionId: createdResolution.id,
                    mismatchId: createdResolution.mismatchId,
                    createdByUserId: createdResolution.createdByUserId,
                    createdAt: createdResolution.createdAt,
                    result: {
                      lpSalesAmount: result.lpSalesAmount,
                      lpSalesUnits: result.lpSalesUnits,
                      storeSalesUnits: result.storeSalesUnits,
                      chosenUnitPrice: result.chosenUnitPrice,
                    },
                  }),
                  hasOpenBlockingMismatches: true,
                  actorUserId: request.actor.userId,
                  appliedAt: now,
                }),
              },
            });

            projectedResultStatusChange = {
              reconciliationResultId: result.id,
              previousStatus: result.status,
              nextStatus: result.status,
              sourceAction: createdResolution.action,
              hasOpenBlockingMismatches: true,
            };
          }
        }
      }

      const openMismatchCount = await tx.mismatch.count({
        where: {
          cycleId: mismatch.cycleId,
          status: "OPEN",
        },
      });

      if (
        mismatch.cycle.status === "MISMATCHES_FOUND" ||
        mismatch.cycle.status === "RECONCILIATION_PASSED"
      ) {
        const nextCycleStatus: $Enums.CycleStatus =
          openMismatchCount === 0
            ? "RECONCILIATION_PASSED"
            : "MISMATCHES_FOUND";

        didCycleTransitionToReconciliationPassed =
          mismatch.cycle.status !== "RECONCILIATION_PASSED" &&
          nextCycleStatus === "RECONCILIATION_PASSED";

        await tx.reconciliationCycle.update({
          where: {
            id: mismatch.cycleId,
          },
          data: {
            status: nextCycleStatus,
            reconciliationPassedAt: openMismatchCount === 0 ? now : null,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorType: "USER",
          actorUserId: request.actor.userId,
          action: "mismatch.resolution.recorded",
          entityType: "MISMATCH",
          entityId: mismatch.id,
          cycleId: mismatch.cycleId,
          metadata: {
            workspace: request.workspace,
            resolutionAction: request.action,
            previousStatus: mismatch.status,
            nextStatus: nextMismatchStatus,
            commentPresent: Boolean(comment),
            payloadPresent: parsedPayload.value !== null,
            reconciliationResultId: mismatch.reconciliationResultId,
            reconciliationResultProjection: projectedResultStatusChange,
            cycleTransitionedToReconciliationPassed:
              didCycleTransitionToReconciliationPassed,
          },
        },
      });
    });

    if (
      didCycleTransitionToReconciliationPassed &&
      request.action !== "COMMENT_ONLY"
    ) {
      try {
        await enqueueStatementGenerationFromResolution({
          cycleId: mismatch.cycleId,
          actorUserId: request.actor.userId,
          mismatchId: mismatch.id,
        });
      } catch (enqueueError) {
        console.error(
          "Mismatch resolution succeeded but statement enqueueing failed",
          enqueueError,
        );
      }
    }

    return {
      status: "success",
      cycleId: mismatch.cycleId,
      mismatchId: mismatch.id,
      mismatchStatus: nextMismatchStatus,
      action: request.action,
      nextTab:
        nextMismatchStatus === "WAIVED"
          ? "waived"
          : nextMismatchStatus === "RESOLVED"
            ? "resolved"
            : "open",
    };
  } catch (error) {
    console.error("Failed to resolve mismatch", error);

    return {
      status: "error",
      cycleId: null,
      mismatchId,
    };
  }
}
