import { randomUUID } from "node:crypto";

import {
  type GenerateStatementPayload,
  normalizeBarcode,
  type ReconcileCyclePayload,
} from "@vendorstream/contracts";
import type { $Enums, Prisma } from "@vendorstream/database";

import { logger } from "../../logger.js";
import {
  ReconciliationRepository,
  type CycleForReconciliation,
  type MismatchDraft,
  type ReconciliationResultDraft,
} from "../../repositories/reconciliation-repository.js";
import { StatementRepository } from "../../repositories/statement-repository.js";

type ReconcileCycleDependencies = {
  repository: ReconciliationRepository;
  statementRepository: StatementRepository;
};

type ReconcileCycleOutcome = {
  statementGenerationPayload: GenerateStatementPayload | null;
};

type MatchedPair =
  | {
      type: "MATCHED";
      lpRow: CycleForReconciliation["lpRows"][number];
      storeRow: CycleForReconciliation["storeRows"][number];
    }
  | {
      type: "LP_ONLY";
      lpRow: CycleForReconciliation["lpRows"][number];
    }
  | {
      type: "STORE_ONLY";
      storeRow: CycleForReconciliation["storeRows"][number];
    };

function normalizeText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeCategoryKey(value: string | null | undefined): string | null {
  return normalizeText(value);
}

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function numbersDiffer(left: number | null, right: number | null): boolean {
  if (left === null && right === null) {
    return false;
  }

  if (left === null || right === null) {
    return true;
  }

  return Math.abs(left - right) > 0.0001;
}

function buildRowGroups<T extends { canonicalBarcode: string | null }>(
  rows: T[],
): { keyed: Map<string, T[]>; missingBarcode: T[] } {
  const keyed = new Map<string, T[]>();
  const missingBarcode: T[] = [];

  for (const row of rows) {
    const normalizedBarcode = normalizeBarcode(row.canonicalBarcode);

    if (!normalizedBarcode) {
      missingBarcode.push(row);
      continue;
    }

    const existing = keyed.get(normalizedBarcode) ?? [];
    existing.push(row);
    keyed.set(normalizedBarcode, existing);
  }

  return { keyed, missingBarcode };
}

function pairRowsForCycle(input: CycleForReconciliation): MatchedPair[] {
  const lpGroups = buildRowGroups(input.lpRows);
  const storeGroups = buildRowGroups(input.storeRows);
  const matches: MatchedPair[] = [];

  const allBarcodes = new Set([
    ...lpGroups.keyed.keys(),
    ...storeGroups.keyed.keys(),
  ]);

  for (const barcode of allBarcodes) {
    const lpRows = [...(lpGroups.keyed.get(barcode) ?? [])].sort(
      (left, right) => left.sourceRowNumber - right.sourceRowNumber,
    );
    const storeRows = [...(storeGroups.keyed.get(barcode) ?? [])].sort(
      (left, right) => left.sourceRowNumber - right.sourceRowNumber,
    );

    while (lpRows.length > 0 && storeRows.length > 0) {
      const lpRow = lpRows.shift();
      const storeRow = storeRows.shift();

      if (lpRow && storeRow) {
        matches.push({
          type: "MATCHED",
          lpRow,
          storeRow,
        });
      }
    }

    for (const lpRow of lpRows) {
      matches.push({
        type: "LP_ONLY",
        lpRow,
      });
    }

    for (const storeRow of storeRows) {
      matches.push({
        type: "STORE_ONLY",
        storeRow,
      });
    }
  }

  for (const lpRow of lpGroups.missingBarcode) {
    matches.push({
      type: "LP_ONLY",
      lpRow,
    });
  }

  for (const storeRow of storeGroups.missingBarcode) {
    matches.push({
      type: "STORE_ONLY",
      storeRow,
    });
  }

  return matches;
}

function buildActiveCategoryRuleMap(
  rules: CycleForReconciliation["categoryRules"],
): Map<string, CycleForReconciliation["categoryRules"][number]> {
  const ruleMap = new Map<string, CycleForReconciliation["categoryRules"][number]>();

  for (const rule of rules) {
    const key = normalizeCategoryKey(rule.categoryKey);

    if (!key || ruleMap.has(key)) {
      continue;
    }

    ruleMap.set(key, rule);
  }

  return ruleMap;
}

function buildActiveProductRuleMap(
  rules: CycleForReconciliation["productScaleRules"],
): Map<string, CycleForReconciliation["productScaleRules"][number]> {
  const ruleMap = new Map<string, CycleForReconciliation["productScaleRules"][number]>();

  for (const rule of rules) {
    const key = normalizeBarcode(rule.barcode);

    if (!key || ruleMap.has(key)) {
      continue;
    }

    ruleMap.set(key, rule);
  }

  return ruleMap;
}

function pushMismatch(
  mismatches: MismatchDraft[],
  params: {
    reconciliationResultId: string | null;
    type: $Enums.MismatchType;
    fieldName?: string | null;
    message: string;
    details: Prisma.InputJsonValue;
  },
): void {
  mismatches.push({
    id: randomUUID(),
    reconciliationResultId: params.reconciliationResultId,
    type: params.type,
    fieldName: params.fieldName ?? null,
    message: params.message,
    details: params.details,
  });
}

function buildMissingCounterpartResult(
  cycleId: string,
  pair: Extract<MatchedPair, { type: "LP_ONLY" | "STORE_ONLY" }>,
): { result: ReconciliationResultDraft; mismatches: MismatchDraft[] } {
  const resultId = randomUUID();
  const mismatches: MismatchDraft[] = [];

  if (pair.type === "LP_ONLY") {
    const lpSalesUnits = decimalToNumber(pair.lpRow.salesUnits);

    pushMismatch(mismatches, {
      reconciliationResultId: resultId,
      type: "MISSING_COUNTERPART",
      message:
        "LP row could not be matched to a store row with the same normalized barcode.",
      details: {
        cycleId,
        side: "LP",
        lpRowId: pair.lpRow.id,
        sourceRowNumber: pair.lpRow.sourceRowNumber,
        canonicalBarcode: pair.lpRow.canonicalBarcode,
      },
    });

    return {
      result: {
        id: resultId,
        lpRowId: pair.lpRow.id,
        storeRowId: null,
        status: "LP_ONLY",
        barcode: pair.lpRow.canonicalBarcode,
        productName: pair.lpRow.productName,
        categoryKey: pair.lpRow.categoryKey,
        lpSalesAmount: decimalToNumber(pair.lpRow.salesAmount),
        lpSalesUnits,
        storeSalesAmount: null,
        storeSalesUnits: null,
        chosenUnitPrice: null,
        categoryRuleId: null,
        productScaleRuleId: null,
        calculatedCommissionPercent: null,
        calculatedCommissionAmount: null,
        details: {
          matchType: "LP_ONLY",
          sourceRowNumber: pair.lpRow.sourceRowNumber,
          notes: [
            "No store counterpart was found for this LP row.",
            "TODO: add duplicate-row aware matching within barcode groups.",
          ],
        },
      },
      mismatches,
    };
  }

  pushMismatch(mismatches, {
    reconciliationResultId: resultId,
    type: "MISSING_COUNTERPART",
    message:
      "Store row could not be matched to an LP row with the same normalized barcode.",
    details: {
      cycleId,
      side: "STORE",
      storeRowId: pair.storeRow.id,
      sourceRowNumber: pair.storeRow.sourceRowNumber,
      canonicalBarcode: pair.storeRow.canonicalBarcode,
    },
  });

  if (pair.storeRow.usedFallbackPrice) {
    pushMismatch(mismatches, {
      reconciliationResultId: resultId,
      type: "PRICE_FORMULA_FALLBACK",
      fieldName: "finalUnitPrice",
      message:
        "Store row used fallback pricing because primary price inputs were incomplete.",
      details: {
        cycleId,
        storeRowId: pair.storeRow.id,
        sourceRowNumber: pair.storeRow.sourceRowNumber,
        unitPricePrimary: decimalToNumber(pair.storeRow.unitPricePrimary),
        unitPriceFallback: decimalToNumber(pair.storeRow.unitPriceFallback),
      },
    });
  }

  return {
    result: {
      id: resultId,
      lpRowId: null,
      storeRowId: pair.storeRow.id,
      status: "STORE_ONLY",
      barcode: pair.storeRow.canonicalBarcode,
      productName: pair.storeRow.productName,
      categoryKey: pair.storeRow.categoryKey,
      lpSalesAmount: null,
      lpSalesUnits: null,
      storeSalesAmount: decimalToNumber(pair.storeRow.salesAmount),
      storeSalesUnits: decimalToNumber(pair.storeRow.salesUnits),
      chosenUnitPrice: decimalToNumber(pair.storeRow.finalUnitPrice),
      categoryRuleId: null,
      productScaleRuleId: null,
      calculatedCommissionPercent: null,
      calculatedCommissionAmount: null,
      details: {
        matchType: "STORE_ONLY",
        sourceRowNumber: pair.storeRow.sourceRowNumber,
        usedFallbackPrice: pair.storeRow.usedFallbackPrice,
        notes: [
          "No LP counterpart was found for this store row.",
          "TODO: add duplicate-row aware matching within barcode groups.",
        ],
      },
    },
    mismatches,
  };
}

function buildMatchedResult(args: {
  cycleId: string;
  pair: Extract<MatchedPair, { type: "MATCHED" }>;
  categoryRuleMap: Map<string, CycleForReconciliation["categoryRules"][number]>;
  productRuleMap: Map<string, CycleForReconciliation["productScaleRules"][number]>;
}): { result: ReconciliationResultDraft; mismatches: MismatchDraft[] } {
  const { cycleId, pair, categoryRuleMap, productRuleMap } = args;
  const resultId = randomUUID();
  const mismatches: MismatchDraft[] = [];

  const barcode =
    normalizeBarcode(pair.lpRow.canonicalBarcode) ??
    normalizeBarcode(pair.storeRow.canonicalBarcode);
  const productName = pair.lpRow.productName ?? pair.storeRow.productName;
  const categoryKey = pair.lpRow.categoryKey ?? pair.storeRow.categoryKey;
  const normalizedCategoryKey = normalizeCategoryKey(categoryKey);

  const categoryRule = normalizedCategoryKey
    ? categoryRuleMap.get(normalizedCategoryKey) ?? null
    : null;
  const productScaleRule = barcode ? productRuleMap.get(barcode) ?? null : null;

  const lpSalesUnits = decimalToNumber(pair.lpRow.salesUnits);
  const storeSalesUnits = decimalToNumber(pair.storeRow.salesUnits);
  const storeSalesAmount = decimalToNumber(pair.storeRow.salesAmount);
  const chosenUnitPrice = decimalToNumber(pair.storeRow.finalUnitPrice);
  const fallbackUnitPrice = decimalToNumber(pair.storeRow.unitPriceFallback);
  const primaryUnitPrice = decimalToNumber(pair.storeRow.unitPricePrimary);

  const fieldDifferences: Array<{
    fieldName: string;
    lpValue: string | number | null;
    storeValue: string | number | null;
    message: string;
  }> = [];

  const normalizedLpProductName = normalizeText(pair.lpRow.productName);
  const normalizedStoreProductName = normalizeText(pair.storeRow.productName);

  if (
    normalizedLpProductName &&
    normalizedStoreProductName &&
    normalizedLpProductName !== normalizedStoreProductName
  ) {
    fieldDifferences.push({
      fieldName: "productName",
      lpValue: pair.lpRow.productName,
      storeValue: pair.storeRow.productName,
      message: "LP and store product names do not match.",
    });
  }

  if (
    normalizeCategoryKey(pair.lpRow.categoryKey) &&
    normalizeCategoryKey(pair.storeRow.categoryKey) &&
    normalizeCategoryKey(pair.lpRow.categoryKey) !==
      normalizeCategoryKey(pair.storeRow.categoryKey)
  ) {
    fieldDifferences.push({
      fieldName: "categoryKey",
      lpValue: pair.lpRow.categoryKey,
      storeValue: pair.storeRow.categoryKey,
      message: "LP and store category keys do not match.",
    });
  }

  if (numbersDiffer(lpSalesUnits, storeSalesUnits)) {
    fieldDifferences.push({
      fieldName: "salesUnits",
      lpValue: lpSalesUnits,
      storeValue: storeSalesUnits,
      message: "LP and store sales unit counts do not match.",
    });
  }

  for (const difference of fieldDifferences) {
    pushMismatch(mismatches, {
      reconciliationResultId: resultId,
      type: "FIELD_DIFFERENCE",
      fieldName: difference.fieldName,
      message: difference.message,
      details: {
        cycleId,
        lpRowId: pair.lpRow.id,
        storeRowId: pair.storeRow.id,
        lpValue: difference.lpValue,
        storeValue: difference.storeValue,
      },
    });
  }

  if (pair.storeRow.usedFallbackPrice) {
    pushMismatch(mismatches, {
      reconciliationResultId: resultId,
      type: "PRICE_FORMULA_FALLBACK",
      fieldName: "finalUnitPrice",
      message:
        "Store row used fallback pricing because Sales or Sales Units were unavailable for the primary formula.",
      details: {
        cycleId,
        storeRowId: pair.storeRow.id,
        primaryUnitPrice,
        fallbackUnitPrice,
      },
    });
  }

  if (chosenUnitPrice === null) {
    pushMismatch(mismatches, {
      reconciliationResultId: resultId,
      type: "BUSINESS_RULE_VIOLATION",
      fieldName: "chosenUnitPrice",
      message: "Store pricing could not be derived from either pricing formula.",
      details: {
        cycleId,
        storeRowId: pair.storeRow.id,
        primaryUnitPrice,
        fallbackUnitPrice,
      },
    });
  }

  if (!categoryRule) {
    pushMismatch(mismatches, {
      reconciliationResultId: resultId,
      type: "BUSINESS_RULE_VIOLATION",
      fieldName: "categoryRuleId",
      message:
        "No active category rule was found for the reconciled category key.",
      details: {
        cycleId,
        categoryKey,
        lpRowId: pair.lpRow.id,
        storeRowId: pair.storeRow.id,
      },
    });
  }

  if (!productScaleRule) {
    pushMismatch(mismatches, {
      reconciliationResultId: resultId,
      type: "BUSINESS_RULE_VIOLATION",
      fieldName: "productScaleRuleId",
      message:
        "No active product scale rule was found for the reconciled barcode.",
      details: {
        cycleId,
        barcode,
        lpRowId: pair.lpRow.id,
        storeRowId: pair.storeRow.id,
      },
    });
  }

  const categoryMaxScale = decimalToNumber(categoryRule?.maxScale);
  const productScale = decimalToNumber(productScaleRule?.productScale);

  if (
    categoryRule &&
    productScaleRule &&
    categoryMaxScale !== null &&
    productScale !== null &&
    productScale > categoryMaxScale
  ) {
    pushMismatch(mismatches, {
      reconciliationResultId: resultId,
      type: "BUSINESS_RULE_VIOLATION",
      fieldName: "productScale",
      message:
        "Product scale exceeds the category max scale allowed for this LP category.",
      details: {
        cycleId,
        barcode,
        productScale,
        categoryMaxScale,
        categoryRuleId: categoryRule.id,
        productScaleRuleId: productScaleRule.id,
      },
    });
  }

  return {
    result: {
      id: resultId,
      lpRowId: pair.lpRow.id,
      storeRowId: pair.storeRow.id,
      status: mismatches.length > 0 ? "MISMATCH" : "MATCHED",
      barcode,
      productName,
      categoryKey,
      lpSalesAmount: decimalToNumber(pair.lpRow.salesAmount),
      lpSalesUnits,
      storeSalesAmount,
      storeSalesUnits,
      chosenUnitPrice,
      categoryRuleId: categoryRule?.id ?? null,
      productScaleRuleId: productScaleRule?.id ?? null,
      calculatedCommissionPercent: null,
      calculatedCommissionAmount: null,
      details: {
        matchType: "MATCHED",
        lpSourceRowNumber: pair.lpRow.sourceRowNumber,
        storeSourceRowNumber: pair.storeRow.sourceRowNumber,
        fieldDifferences,
        usedFallbackPrice: pair.storeRow.usedFallbackPrice,
        appliedRuleSummary: {
          categoryRuleId: categoryRule?.id ?? null,
          productScaleRuleId: productScaleRule?.id ?? null,
          categoryMaxScale,
          categoryMaxCommissionPercent: decimalToNumber(
            categoryRule?.maxCommissionPercent,
          ),
          productScale,
        },
        notes: [
          "TODO: refine duplicate matching within a barcode group beyond source-row ordering.",
          "TODO: calculate commission percent and amount after the statement formula is finalized.",
        ],
      },
    },
    mismatches,
  };
}

function assertPayloadMatchesCycle(
  input: CycleForReconciliation,
  payload: ReconcileCyclePayload,
): void {
  const mismatches: string[] = [];

  if (input.cycle.id !== payload.cycleId) {
    mismatches.push("cycleId");
  }

  if (input.cycle.lpId !== payload.lpId) {
    mismatches.push("lpId");
  }

  if (input.cycle.storeLocationId !== payload.storeLocationId) {
    mismatches.push("storeLocationId");
  }

  if (input.cycle.periodMonth.toISOString().slice(0, 7) !== payload.periodMonth) {
    mismatches.push("periodMonth");
  }

  if (mismatches.length > 0) {
    throw new Error(
      `reconcile-cycle payload does not match cycle data for fields: ${mismatches.join(", ")}`,
    );
  }
}

export async function reconcileCycle(
  payload: ReconcileCyclePayload,
  dependencies: ReconcileCycleDependencies,
): Promise<ReconcileCycleOutcome> {
  const { repository, statementRepository } = dependencies;
  const input = await repository.getCycleForReconciliation(payload.cycleId);

  if (!input) {
    throw new Error(`Cycle ${payload.cycleId} was not found.`);
  }

  assertPayloadMatchesCycle(input, payload);

  if (!input.currentLpBatch || !input.currentStoreBatch) {
    const errorMessage =
      "Both current LP and store batches are required before reconciliation can begin.";
    await repository.markCycleReconciliationFailed(payload.cycleId, errorMessage);
    logger.warn(
      {
        cycleId: payload.cycleId,
        lpBatchId: input.currentLpBatch?.id ?? null,
        storeBatchId: input.currentStoreBatch?.id ?? null,
      },
      "Cycle reconciliation skipped because both current batches are not available",
    );
    return {
      statementGenerationPayload: null,
    };
  }

  await repository.beginCycleReconciliation(payload.cycleId, [
    input.currentLpBatch.id,
    input.currentStoreBatch.id,
  ]);

  try {
    const pairs = pairRowsForCycle(input);
    const categoryRuleMap = buildActiveCategoryRuleMap(input.categoryRules);
    const productRuleMap = buildActiveProductRuleMap(input.productScaleRules);
    const resultRows: ReconciliationResultDraft[] = [];
    const mismatches: MismatchDraft[] = [];

    for (const pair of pairs) {
      if (pair.type === "MATCHED") {
        const entry = buildMatchedResult({
          cycleId: payload.cycleId,
          pair,
          categoryRuleMap,
          productRuleMap,
        });

        resultRows.push(entry.result);
        mismatches.push(...entry.mismatches);
        continue;
      }

      const entry = buildMissingCounterpartResult(payload.cycleId, pair);
      resultRows.push(entry.result);
      mismatches.push(...entry.mismatches);
    }

    const finalCycleStatus: $Enums.CycleStatus =
      mismatches.length > 0 ? "MISMATCHES_FOUND" : "RECONCILIATION_PASSED";
    const reconciliationPassedAt =
      finalCycleStatus === "RECONCILIATION_PASSED" ? new Date() : null;

    await repository.persistReconciliationOutcome({
      cycleId: payload.cycleId,
      resultRows,
      mismatches,
      finalCycleStatus,
      reconciliationPassedAt,
    });

    logger.info(
      {
        cycleId: payload.cycleId,
        resultCount: resultRows.length,
        mismatchCount: mismatches.length,
        finalCycleStatus,
      },
      "Cycle reconciliation completed",
    );

    if (finalCycleStatus !== "RECONCILIATION_PASSED") {
      return {
        statementGenerationPayload: null,
      };
    }

    try {
      const statementTask = await statementRepository.ensurePendingTaskForCycle(
        payload.cycleId,
      );

      return {
        statementGenerationPayload: statementTask
          ? {
              statementTaskId: statementTask.id,
              cycleId: statementTask.cycleId,
            }
          : null,
      };
    } catch (statementTaskError) {
      logger.error(
        {
          err: statementTaskError,
          cycleId: payload.cycleId,
        },
        "Reconciliation passed but statement task preparation failed",
      );

      return {
        statementGenerationPayload: null,
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown reconciliation error";

    await repository.markCycleReconciliationFailed(payload.cycleId, errorMessage);

    logger.error(
      {
        err: error,
        cycleId: payload.cycleId,
      },
      "Cycle reconciliation failed unexpectedly",
    );

    throw error;
  }
}
