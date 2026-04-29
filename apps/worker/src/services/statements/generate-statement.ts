import type { GenerateStatementPayload } from "@vendorstream/contracts";
import { createHash } from "node:crypto";

import type { SupabaseStorageAdapter } from "../../adapters/supabase-storage.js";
import { logger } from "../../logger.js";
import {
  StatementRepository,
  type StatementArtifactRecord,
  type StatementGenerationLineItemDraft,
  type StatementTaskForGeneration,
} from "../../repositories/statement-repository.js";

type GenerateStatementDependencies = {
  repository: StatementRepository;
  storageAdapter: SupabaseStorageAdapter;
};

const GENERATED_REPORTS_BUCKET = "generated-reports";
const STATEMENT_ARTIFACT_CONTENT_TYPE = "text/csv; charset=utf-8";

type StatementComputation = {
  lineItems: StatementGenerationLineItemDraft[];
  totalSalesAmount: number;
  totalSalesUnits: number;
  totalCommissionAmount: number;
};

type EffectiveResolutionProjection = {
  effectiveStatus: "MATCHED" | "WAIVED";
  effectiveValues: {
    reconciledUnits: number | null;
    unitPrice: number | null;
  } | null;
};

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function roundTo(value: number, scale: number): number {
  const factor = 10 ** scale;
  return Math.round(value * factor) / factor;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getEffectiveResolutionProjection(
  details: unknown,
): EffectiveResolutionProjection | null {
  const detailsObject = asRecord(details);
  const projectionObject = asRecord(detailsObject?.resolutionProjection);

  if (!projectionObject) {
    return null;
  }

  const status = projectionObject.effectiveStatus;

  if (status !== "MATCHED" && status !== "WAIVED") {
    return null;
  }

  const effectiveValues = asRecord(projectionObject.effectiveValues);

  return {
    effectiveStatus: status,
    effectiveValues: effectiveValues
      ? {
          reconciledUnits: decimalToNumber(effectiveValues.reconciledUnits),
          unitPrice: decimalToNumber(effectiveValues.unitPrice),
        }
      : null,
  };
}

function calculateCommissionPercent(args: {
  categoryMaxScale: number;
  categoryMaxCommissionPercent: number;
  productScale: number;
}): number {
  const normalizedScale = Math.min(
    Math.max(args.productScale, 0) / args.categoryMaxScale,
    1,
  );

  return roundTo(normalizedScale * args.categoryMaxCommissionPercent, 4);
}

function extractUsedFallbackPriceFlag(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return false;
  }

  const value = (details as Record<string, unknown>).usedFallbackPrice;
  return value === true;
}

function assertPayloadMatchesTask(
  input: StatementTaskForGeneration,
  payload: GenerateStatementPayload,
): void {
  const mismatches: string[] = [];

  if (input.task.id !== payload.statementTaskId) {
    mismatches.push("statementTaskId");
  }

  if (input.task.cycleId !== payload.cycleId) {
    mismatches.push("cycleId");
  }

  if (mismatches.length > 0) {
    throw new Error(
      `generate-statement payload does not match database state for fields: ${mismatches.join(", ")}`,
    );
  }
}

function buildLineItems(input: StatementTaskForGeneration): {
  computation: StatementComputation | null;
  validationErrors: string[];
} {
  const validationErrors: string[] = [];
  const lineItems: StatementGenerationLineItemDraft[] = [];

  for (const [index, result] of input.results.entries()) {
    const resolutionProjection = getEffectiveResolutionProjection(
      result.details,
    );
    const effectiveStatus =
      resolutionProjection?.effectiveStatus ?? result.status;

    if (effectiveStatus === "WAIVED") {
      continue;
    }

    if (effectiveStatus !== "MATCHED") {
      validationErrors.push(
        `Reconciliation result ${result.id} is ${effectiveStatus} and cannot be turned into a statement line item yet.`,
      );
      continue;
    }

    const hasProjectedValues = Boolean(resolutionProjection?.effectiveValues);

    if (!hasProjectedValues && (!result.lpRowId || !result.storeRowId)) {
      validationErrors.push(
        `Reconciliation result ${result.id} is missing one side of the matched row pair and has no projected effective values.`,
      );
      continue;
    }

    const reconciledUnits =
      resolutionProjection?.effectiveValues?.reconciledUnits ??
      decimalToNumber(result.storeSalesUnits) ??
      decimalToNumber(result.lpSalesUnits);
    const chosenUnitPrice =
      resolutionProjection?.effectiveValues?.unitPrice ??
      decimalToNumber(result.chosenUnitPrice);
    const categoryMaxScale = decimalToNumber(result.categoryRule?.maxScale);
    const categoryMaxCommissionPercent = decimalToNumber(
      result.categoryRule?.maxCommissionPercent,
    );
    const productScale = decimalToNumber(result.productScaleRule?.productScale);

    if (reconciledUnits === null || reconciledUnits <= 0) {
      validationErrors.push(
        `Reconciliation result ${result.id} is missing a positive reconciled unit count.`,
      );
      continue;
    }

    if (chosenUnitPrice === null || chosenUnitPrice < 0) {
      validationErrors.push(
        `Reconciliation result ${result.id} is missing a usable chosen unit price.`,
      );
      continue;
    }

    if (
      categoryMaxScale === null ||
      categoryMaxScale <= 0 ||
      categoryMaxCommissionPercent === null ||
      categoryMaxCommissionPercent < 0 ||
      productScale === null ||
      productScale < 0
    ) {
      validationErrors.push(
        `Reconciliation result ${result.id} is missing effective category or product rule data required for commission calculation.`,
      );
      continue;
    }

    const commissionPercent = calculateCommissionPercent({
      categoryMaxScale,
      categoryMaxCommissionPercent,
      productScale,
    });
    const lineSalesAmount = roundTo(reconciledUnits * chosenUnitPrice, 4);
    const commissionAmount = roundTo(
      lineSalesAmount * (commissionPercent / 100),
      4,
    );
    const usedFallbackPrice = extractUsedFallbackPriceFlag(result.details);

    lineItems.push({
      reconciliationResultId: result.id,
      barcode: result.barcode,
      productName: result.productName,
      categoryKey: result.categoryKey,
      lpSalesUnits: decimalToNumber(result.lpSalesUnits),
      storeSalesUnits: decimalToNumber(result.storeSalesUnits),
      reconciledUnits,
      unitPrice: chosenUnitPrice,
      categoryMaxScale,
      categoryMaxCommissionPercent,
      productScale,
      commissionPercent,
      commissionAmount,
      notes: usedFallbackPrice
        ? "Store pricing used the fallback unit-price formula."
        : null,
      sortOrder: index,
    });
  }

  if (validationErrors.length > 0) {
    return {
      computation: null,
      validationErrors,
    };
  }

  const totalSalesAmount = roundTo(
    lineItems.reduce(
      (sum, item) => sum + (item.reconciledUnits ?? 0) * (item.unitPrice ?? 0),
      0,
    ),
    4,
  );
  const totalSalesUnits = roundTo(
    lineItems.reduce((sum, item) => sum + (item.reconciledUnits ?? 0), 0),
    4,
  );
  const totalCommissionAmount = roundTo(
    lineItems.reduce((sum, item) => sum + (item.commissionAmount ?? 0), 0),
    4,
  );

  return {
    computation: {
      lineItems,
      totalSalesAmount,
      totalSalesUnits,
      totalCommissionAmount,
    },
    validationErrors,
  };
}

function summarizeValidationErrors(errors: string[]): string {
  const preview = errors.slice(0, 3).join(" ");
  const remainingCount = errors.length - Math.min(errors.length, 3);

  if (remainingCount <= 0) {
    return preview;
  }

  return `${preview} ${remainingCount} additional validation issue(s) were omitted.`;
}

function normalizePathSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "unknown";
}

function formatPeriodMonth(value: Date): string {
  return value.toISOString().slice(0, 7);
}

function escapeCsvValue(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function valueToCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const stringValue = String(value);
  return escapeCsvValue(stringValue);
}

function buildStatementArtifactCsv(statement: StatementArtifactRecord): string {
  const headers = [
    "statement_id",
    "cycle_id",
    "version",
    "statement_status",
    "currency",
    "period_month",
    "lp_id",
    "lp_name",
    "store_location_id",
    "store_location_name",
    "store_organization_name",
    "generated_at",
    "total_sales_amount",
    "total_sales_units",
    "total_commission_amount",
    "line_sort_order",
    "barcode",
    "product_name",
    "category_key",
    "reconciled_units",
    "unit_price",
    "commission_percent",
    "commission_amount",
    "notes",
  ];

  const lineItems =
    statement.lineItems.length > 0 ? statement.lineItems : [null];
  const rows = lineItems.map((lineItem) => [
    statement.id,
    statement.cycleId,
    statement.version,
    statement.status,
    statement.currency,
    formatPeriodMonth(statement.cycle.periodMonth),
    statement.cycle.lpId,
    statement.cycle.lp.name,
    statement.cycle.storeLocationId,
    statement.cycle.storeLocation.name,
    statement.cycle.storeLocation.storeOrganization.name,
    statement.generatedAt,
    statement.totalSalesAmount,
    statement.totalSalesUnits,
    statement.totalCommissionAmount,
    lineItem?.sortOrder ?? null,
    lineItem?.barcode ?? null,
    lineItem?.productName ?? null,
    lineItem?.categoryKey ?? null,
    lineItem?.reconciledUnits ?? null,
    lineItem?.unitPrice ?? null,
    lineItem?.commissionPercent ?? null,
    lineItem?.commissionAmount ?? null,
    lineItem?.notes ?? null,
  ]);

  return [
    headers.map((value) => valueToCsvCell(value)).join(","),
    ...rows.map((row) => row.map((value) => valueToCsvCell(value)).join(",")),
  ].join("\n");
}

function buildStatementArtifactFileIdentity(
  statement: StatementArtifactRecord,
): {
  originalFilename: string;
  storagePath: string;
} {
  const periodMonth = formatPeriodMonth(statement.cycle.periodMonth);
  const lpSlug = normalizePathSegment(statement.cycle.lp.name);
  const storeSlug = normalizePathSegment(statement.cycle.storeLocation.name);
  const originalFilename = `statement_${periodMonth}_${lpSlug}_${storeSlug}_v${statement.version}.csv`;
  const storagePath = [
    "statements",
    periodMonth,
    statement.cycle.lpId,
    statement.cycle.storeLocationId,
    `statement-v${statement.version}-${statement.id}.csv`,
  ].join("/");

  return {
    originalFilename,
    storagePath,
  };
}

async function ensureStatementArtifact(args: {
  statementId: string;
  repository: StatementRepository;
  storageAdapter: SupabaseStorageAdapter;
}): Promise<void> {
  const statement = await args.repository.getStatementArtifactRecord(
    args.statementId,
  );

  if (!statement) {
    throw new Error(
      `Statement ${args.statementId} was not found for artifact creation.`,
    );
  }

  if (statement.generatedFileId || statement.generatedFile) {
    return;
  }

  const csvContent = buildStatementArtifactCsv(statement);
  const csvBuffer = Buffer.from(csvContent, "utf8");
  const checksumSha256 = createHash("sha256").update(csvBuffer).digest("hex");
  const fileIdentity = buildStatementArtifactFileIdentity(statement);

  await args.storageAdapter.uploadObject({
    bucket: GENERATED_REPORTS_BUCKET,
    storagePath: fileIdentity.storagePath,
    data: csvBuffer,
    contentType: STATEMENT_ARTIFACT_CONTENT_TYPE,
    upsert: true,
  });

  await args.repository.linkGeneratedFileToStatement({
    statementId: statement.id,
    bucket: GENERATED_REPORTS_BUCKET,
    storagePath: fileIdentity.storagePath,
    originalFilename: fileIdentity.originalFilename,
    mimeType: "text/csv",
    sizeBytes: csvBuffer.byteLength,
    checksumSha256,
  });
}

export async function generateStatement(
  payload: GenerateStatementPayload,
  dependencies: GenerateStatementDependencies,
): Promise<void> {
  const { repository, storageAdapter } = dependencies;
  const input = await repository.getTaskForGeneration(payload.statementTaskId);

  if (!input) {
    throw new Error(`Statement task ${payload.statementTaskId} was not found.`);
  }

  assertPayloadMatchesTask(input, payload);

  if (input.task.status === "CANCELED") {
    logger.warn(
      {
        statementTaskId: input.task.id,
        cycleId: input.task.cycleId,
      },
      "Skipping generate-statement because the task is canceled",
    );
    return;
  }

  if (input.existingStatementForTask) {
    await repository.syncExistingGeneratedStatement({
      statementTaskId: input.task.id,
      cycleId: input.task.cycleId,
      generatedAt: input.existingStatementForTask.generatedAt,
    });

    await ensureStatementArtifact({
      statementId: input.existingStatementForTask.id,
      repository,
      storageAdapter,
    });

    logger.info(
      {
        statementTaskId: input.task.id,
        cycleId: input.task.cycleId,
        statementId: input.existingStatementForTask.id,
        version: input.existingStatementForTask.version,
      },
      "Statement task already had a generated statement; synced task and cycle state",
    );
    return;
  }

  if (input.openMismatchCount > 0) {
    const errorMessage =
      "Statement generation requires a cycle with no open mismatches.";

    await repository.markStatementGenerationFailed(
      input.task.id,
      input.task.cycleId,
      errorMessage,
    );

    logger.warn(
      {
        statementTaskId: input.task.id,
        cycleId: input.task.cycleId,
        openMismatchCount: input.openMismatchCount,
      },
      "Statement generation skipped because open mismatches remain",
    );
    return;
  }

  if (
    ![
      "RECONCILIATION_PASSED",
      "STATEMENT_PENDING",
      "STATEMENT_GENERATING",
      "STATEMENT_READY",
    ].includes(input.cycle.status)
  ) {
    const errorMessage = `Cycle ${input.cycle.id} is not ready for statement generation from status ${input.cycle.status}.`;

    await repository.markStatementGenerationFailed(
      input.task.id,
      input.task.cycleId,
      errorMessage,
    );

    logger.warn(
      {
        statementTaskId: input.task.id,
        cycleId: input.task.cycleId,
        cycleStatus: input.cycle.status,
      },
      "Statement generation skipped because the cycle is not in an eligible status",
    );
    return;
  }

  if (input.results.length === 0) {
    const errorMessage =
      "Statement generation requires reconciliation results, but none were found for this cycle.";

    await repository.markStatementGenerationFailed(
      input.task.id,
      input.task.cycleId,
      errorMessage,
    );

    logger.warn(
      {
        statementTaskId: input.task.id,
        cycleId: input.task.cycleId,
      },
      "Statement generation skipped because the cycle has no reconciliation results",
    );
    return;
  }

  await repository.beginStatementGeneration(input.task.id, input.task.cycleId);

  try {
    const { computation, validationErrors } = buildLineItems(input);

    if (!computation || computation.lineItems.length === 0) {
      const errorMessage = validationErrors.length
        ? summarizeValidationErrors(validationErrors)
        : "Statement generation did not produce any eligible line items.";

      await repository.markStatementGenerationFailed(
        input.task.id,
        input.task.cycleId,
        errorMessage,
      );

      logger.warn(
        {
          statementTaskId: input.task.id,
          cycleId: input.task.cycleId,
          validationErrors,
        },
        "Statement generation validation failed",
      );
      return;
    }

    const outcome = await repository.completeGeneratedStatement({
      statementTaskId: input.task.id,
      cycleId: input.task.cycleId,
      currency: "CAD",
      totalSalesAmount: computation.totalSalesAmount,
      totalSalesUnits: computation.totalSalesUnits,
      totalCommissionAmount: computation.totalCommissionAmount,
      lineItems: computation.lineItems,
    });

    await ensureStatementArtifact({
      statementId: outcome.statementId,
      repository,
      storageAdapter,
    });

    logger.info(
      {
        statementTaskId: input.task.id,
        cycleId: input.task.cycleId,
        statementId: outcome.statementId,
        version: outcome.version,
        reusedExistingStatement: outcome.reusedExistingStatement,
        lineItemCount: computation.lineItems.length,
        totalSalesAmount: computation.totalSalesAmount,
        totalCommissionAmount: computation.totalCommissionAmount,
      },
      "Statement generation completed",
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown statement generation error";

    await repository.markStatementGenerationFailed(
      input.task.id,
      input.task.cycleId,
      errorMessage,
    );

    logger.error(
      {
        err: error,
        statementTaskId: input.task.id,
        cycleId: input.task.cycleId,
      },
      "Statement generation failed unexpectedly",
    );

    throw error;
  }
}
