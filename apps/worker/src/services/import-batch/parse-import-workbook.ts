import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";

import {
  LP_EXCEL_REQUIRED_HEADERS,
  LpExcelRowSchema,
  STORE_EXCEL_REQUIRED_HEADERS,
  StoreExcelRowSchema,
  normalizeBarcode,
  type ProcessImportBatchPayload,
} from "@vendorstream/contracts";
import type { Prisma } from "@vendorstream/database";

import type {
  ParsedLpWorkbook,
  ParsedStoreWorkbook,
  ParsedWorkbookResult,
  PrevalidationFailure,
} from "./types.js";

type HeaderName =
  | (typeof LP_EXCEL_REQUIRED_HEADERS)[number]
  | (typeof STORE_EXCEL_REQUIRED_HEADERS)[number];

type ParseWorkbookArgs = {
  buffer: Buffer;
  payload: ProcessImportBatchPayload;
  validationContext: {
    lpLegalName: string;
    storeLocationName: string;
    storeAddress: string;
  };
};

type ExtractedWorksheet = {
  worksheetName: string;
  headerRowNumber: number;
  dataRows: Array<{
    rowNumber: number;
    rowData: Record<string, unknown>;
  }>;
};

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getCellPrimitive(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    value instanceof Date ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) {
      return getCellPrimitive(value.result);
    }

    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }

    if (
      "richText" in value &&
      Array.isArray(value.richText) &&
      value.richText.every(
        (part) => typeof part === "object" && part !== null && "text" in part,
      )
    ) {
      return value.richText
        .map((part) => String((part as { text: string }).text))
        .join("");
    }

    if ("hyperlink" in value && typeof value.hyperlink === "string") {
      if ("text" in value && typeof value.text === "string") {
        return value.text;
      }

      return value.hyperlink;
    }

    if ("formula" in value && typeof value.formula === "string") {
      return value.formula;
    }

    if ("error" in value && value.error) {
      return String(value.error);
    }
  }

  return String(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return null as unknown as Prisma.InputJsonValue;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        toJsonValue(entryValue),
      ]),
    );
  }

  return String(value);
}

function isRowEmpty(rowData: Record<string, unknown>): boolean {
  return Object.values(rowData).every((value) => {
    if (value === null || value === undefined) {
      return true;
    }

    if (typeof value === "string") {
      return value.trim().length === 0;
    }

    return false;
  });
}

function formatZodIssues(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string[] {
  return error.issues.map((issue) => {
    const fieldPath =
      issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : "";
    return `${fieldPath}${issue.message}`;
  });
}

function getPeriodMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function isScientificNotationText(value: string): boolean {
  return /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(value.trim());
}

function getRequiredString(
  rowData: Record<string, unknown>,
  fieldName: string,
): string {
  const value = rowData[fieldName];
  return typeof value === "string" ? value.trim() : "";
}

function computeRowFingerprint(parts: Array<string | number | null | undefined>): string {
  const hash = createHash("sha256");
  hash.update(
    parts
      .map((part) => (part === null || part === undefined ? "" : String(part)))
      .join("|"),
  );
  return hash.digest("hex");
}

function buildPrevalidationFailure(
  worksheetName: string | null,
  errors: string[],
  details: Prisma.InputJsonObject = {},
): PrevalidationFailure {
  return {
    kind: "prevalidation-failure",
    errors,
    details: {
      worksheetName,
      ...details,
    },
  };
}

function extractWorksheetData(
  worksheet: ExcelJS.Worksheet,
  requiredHeaders: readonly HeaderName[],
): ExtractedWorksheet | PrevalidationFailure {
  const headerRow = worksheet
    .getRows(1, worksheet.rowCount)
    ?.find((row) => {
      const rowValues = Array.isArray(row.values) ? row.values : [];
      return rowValues.some(
        (value, index) => index > 0 && getCellPrimitive(value) !== null,
      );
    });

  if (!headerRow) {
    return buildPrevalidationFailure(worksheet.name, [
      "The worksheet does not contain a header row.",
    ]);
  }

  const headerColumns = new Map<HeaderName, number>();
  const foundHeaders: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    const headerValue = getCellPrimitive(cell.value);
    if (typeof headerValue !== "string") {
      return;
    }

    const exactHeader = headerValue;
    foundHeaders.push(exactHeader);
    const matchingHeader = requiredHeaders.find(
      (header) => header === exactHeader,
    );

    if (matchingHeader && !headerColumns.has(matchingHeader)) {
      headerColumns.set(matchingHeader, columnNumber);
    }
  });

  const missingHeaders = requiredHeaders.filter(
    (header) => !headerColumns.has(header),
  );

  if (missingHeaders.length > 0) {
    return buildPrevalidationFailure(
      worksheet.name,
      ["The worksheet is missing required columns."],
      {
        missingHeaders,
        foundHeaders,
      },
    );
  }

  const dataRows: ExtractedWorksheet["dataRows"] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRow.number) {
      return;
    }

    const rowData = Object.fromEntries(
      requiredHeaders.map((header) => {
        const columnNumber = headerColumns.get(header);
        const rawValue =
          typeof columnNumber === "number"
            ? getCellPrimitive(row.getCell(columnNumber).value)
            : null;

        return [header, rawValue];
      }),
    );

    if (isRowEmpty(rowData)) {
      return;
    }

    dataRows.push({
      rowNumber,
      rowData,
    });
  });

  return {
    worksheetName: worksheet.name,
    headerRowNumber: headerRow.number,
    dataRows,
  };
}

function buildLpResult(
  extractedWorksheet: ExtractedWorksheet,
  payload: ProcessImportBatchPayload,
  validationContext: ParseWorkbookArgs["validationContext"],
): ParsedLpWorkbook {
  const rawRows: ParsedLpWorkbook["rawRows"] = [];
  const normalizedRows: ParsedLpWorkbook["normalizedRows"] = [];
  const invalidRowsSample: Prisma.InputJsonValue[] = [];

  for (const dataRow of extractedWorksheet.dataRows) {
    const rowId = randomUUID();
    const parsed = LpExcelRowSchema.safeParse(dataRow.rowData);

    if (!parsed.success) {
      const parseErrors = formatZodIssues(parsed.error);
      rawRows.push({
        id: rowId,
        sourceRowNumber: dataRow.rowNumber,
        rawData: toJsonValue(dataRow.rowData),
        parseErrors,
      });

      if (invalidRowsSample.length < 10) {
        invalidRowsSample.push({
          rowNumber: dataRow.rowNumber,
          errors: parseErrors,
        });
      }

      continue;
    }

    const parsedRow = parsed.data;
    const businessErrors: string[] = [];
    const rowPeriodMonth = getPeriodMonth(parsedRow["Order Date"]);

    if (rowPeriodMonth !== payload.periodMonth) {
      businessErrors.push(
        `Order Date month ${rowPeriodMonth} does not match batch month ${payload.periodMonth}.`,
      );
    }

    const vendorName = getRequiredString(dataRow.rowData, "Vendor Name");
    if (
      normalizeComparableText(vendorName) !==
      normalizeComparableText(validationContext.lpLegalName)
    ) {
      businessErrors.push(
        `Vendor Name "${vendorName || "(blank)"}" does not match selected LP legal name "${validationContext.lpLegalName}".`,
      );
    }

    const storeName = getRequiredString(dataRow.rowData, "Store Name");
    if (
      normalizeComparableText(storeName) !==
      normalizeComparableText(validationContext.storeLocationName)
    ) {
      businessErrors.push(
        `Store Name "${storeName || "(blank)"}" does not match selected store location name "${validationContext.storeLocationName}".`,
      );
    }

    const storeAddress = getRequiredString(dataRow.rowData, "Store Address");
    if (
      normalizeComparableText(storeAddress) !==
      normalizeComparableText(validationContext.storeAddress)
    ) {
      businessErrors.push(
        "Store Address does not match the selected store location address.",
      );
    }

    if (typeof dataRow.rowData["Item Barcode"] !== "string") {
      businessErrors.push("Item Barcode must be stored as text in the workbook.");
    }

    if (businessErrors.length > 0) {
      rawRows.push({
        id: rowId,
        sourceRowNumber: dataRow.rowNumber,
        rawData: toJsonValue(dataRow.rowData),
        parseErrors: businessErrors,
      });

      if (invalidRowsSample.length < 10) {
        invalidRowsSample.push({
          rowNumber: dataRow.rowNumber,
          errors: businessErrors,
        });
      }

      continue;
    }

    rawRows.push({
      id: rowId,
      sourceRowNumber: dataRow.rowNumber,
      rawData: toJsonValue({
        ...dataRow.rowData,
        "Order Date": parsedRow["Order Date"],
      }),
    });

    const canonicalBarcode = normalizeBarcode(parsedRow["Item Barcode"]);
    const normalizedData = {
      sku: parsedRow.SKU ?? null,
      itemName: parsedRow["Item Name"] ?? null,
      subCategory: parsedRow["Sub Category"] ?? null,
      brand: parsedRow.Brand ?? null,
      vendorId: parsedRow["Vendor ID"] ?? null,
      vendorName: parsedRow["Vendor Name"] ?? null,
      storeName: parsedRow["Store Name"],
      storeAddress: parsedRow["Store Address"],
      orderDate: parsedRow["Order Date"].toISOString(),
      unitsSold: parsedRow["Units Sold"],
      itemBarcode: parsedRow["Item Barcode"],
    };

    normalizedRows.push({
      id: randomUUID(),
      rawRowId: rowId,
      sourceRowNumber: dataRow.rowNumber,
      canonicalBarcode,
      barcodeNormalized: canonicalBarcode !== parsedRow["Item Barcode"],
      productName: parsedRow["Item Name"] ?? null,
      categoryKey: parsedRow["Sub Category"] ?? null,
      subCategoryKey: null,
      salesAmount: null,
      salesUnits: parsedRow["Units Sold"],
      unitPricePrimary: null,
      unitPriceFallback: null,
      finalUnitPrice: null,
      usedFallbackPrice: false,
      rowFingerprint: computeRowFingerprint([
        payload.cycleId,
        dataRow.rowNumber,
        canonicalBarcode,
        parsedRow["Item Name"] ?? null,
        parsedRow["Sub Category"] ?? null,
        parsedRow["Units Sold"],
      ]),
      normalizedData: toJsonValue(normalizedData),
    });
  }

  return {
    kind: "success",
    sourceType: "LP",
    worksheetName: extractedWorksheet.worksheetName,
    headerRowNumber: extractedWorksheet.headerRowNumber,
    totalRowCount: rawRows.length,
    validRowCount: normalizedRows.length,
    invalidRowCount: rawRows.length - normalizedRows.length,
    rawRows,
    normalizedRows,
    validationSummary: {
      worksheetName: extractedWorksheet.worksheetName,
      headerRowNumber: extractedWorksheet.headerRowNumber,
      totalRowCount: rawRows.length,
      validRowCount: normalizedRows.length,
      invalidRowCount: rawRows.length - normalizedRows.length,
      invalidRowsSample,
    },
  };
}

function buildStoreResult(
  extractedWorksheet: ExtractedWorksheet,
  payload: ProcessImportBatchPayload,
  validationContext: ParseWorkbookArgs["validationContext"],
): ParsedStoreWorkbook {
  const rawRows: ParsedStoreWorkbook["rawRows"] = [];
  const normalizedRows: ParsedStoreWorkbook["normalizedRows"] = [];
  const invalidRowsSample: Prisma.InputJsonValue[] = [];

  for (const dataRow of extractedWorksheet.dataRows) {
    const rowId = randomUUID();
    const parsed = StoreExcelRowSchema.safeParse(dataRow.rowData);

    if (!parsed.success) {
      const parseErrors = formatZodIssues(parsed.error);
      rawRows.push({
        id: rowId,
        sourceRowNumber: dataRow.rowNumber,
        rawData: toJsonValue(dataRow.rowData),
        parseErrors,
      });

      if (invalidRowsSample.length < 10) {
        invalidRowsSample.push({
          rowNumber: dataRow.rowNumber,
          errors: parseErrors,
        });
      }

      continue;
    }

    const parsedRow = parsed.data;
    const businessErrors: string[] = [];

    if (typeof dataRow.rowData["Barcode/UPC"] !== "string") {
      businessErrors.push("Barcode/UPC must be stored as text in the workbook.");
    } else if (isScientificNotationText(dataRow.rowData["Barcode/UPC"])) {
      businessErrors.push(
        "Barcode/UPC must be the full text barcode, not scientific notation.",
      );
    }

    const supplierLp = getRequiredString(dataRow.rowData, "Supplier/LP");
    if (
      normalizeComparableText(supplierLp) !==
      normalizeComparableText(validationContext.lpLegalName)
    ) {
      businessErrors.push(
        "Supplier/LP does not match the selected LP legal name.",
      );
    }

    if (businessErrors.length > 0) {
      rawRows.push({
        id: rowId,
        sourceRowNumber: dataRow.rowNumber,
        rawData: toJsonValue(dataRow.rowData),
        parseErrors: businessErrors,
      });

      if (invalidRowsSample.length < 10) {
        invalidRowsSample.push({
          rowNumber: dataRow.rowNumber,
          errors: businessErrors,
        });
      }

      continue;
    }

    rawRows.push({
      id: rowId,
      sourceRowNumber: dataRow.rowNumber,
      rawData: toJsonValue(dataRow.rowData),
    });

    const canonicalBarcode = normalizeBarcode(parsedRow["Barcode/UPC"]);
    const primaryUnitPrice = parsedRow["Sales ($)"] / parsedRow["Sales Units"];
    const fallbackUnitPrice =
      typeof parsedRow["OCS.ca Sales Price ($) Exclude Tax"] === "number"
        ? parsedRow["OCS.ca Sales Price ($) Exclude Tax"] / 1.39
        : null;
    const finalUnitPrice = primaryUnitPrice;

    const normalizedData = {
      subCategory: parsedRow.SubCategory ?? null,
      subSubCategory: parsedRow.SubSubCategory ?? null,
      supplierLp: parsedRow["Supplier/LP"] ?? null,
      brand: parsedRow.Brand ?? null,
      itemName: parsedRow["Item Name"] ?? null,
      sku: parsedRow.SKU ?? null,
      salesAmount: parsedRow["Sales ($)"],
      salesUnits: parsedRow["Sales Units"],
      ocsPriceExcludingTax:
        parsedRow["OCS.ca Sales Price ($) Exclude Tax"] ?? null,
      barcode: parsedRow["Barcode/UPC"],
    };

    normalizedRows.push({
      id: randomUUID(),
      rawRowId: rowId,
      sourceRowNumber: dataRow.rowNumber,
      canonicalBarcode,
      barcodeNormalized: canonicalBarcode !== parsedRow["Barcode/UPC"],
      productName: parsedRow["Item Name"] ?? null,
      categoryKey: parsedRow.SubCategory ?? null,
      subCategoryKey: parsedRow.SubSubCategory ?? null,
      salesAmount: parsedRow["Sales ($)"],
      salesUnits: parsedRow["Sales Units"],
      unitPricePrimary: primaryUnitPrice,
      unitPriceFallback: fallbackUnitPrice,
      finalUnitPrice,
      usedFallbackPrice: false,
      rowFingerprint: computeRowFingerprint([
        payload.cycleId,
        dataRow.rowNumber,
        canonicalBarcode,
        parsedRow["Item Name"] ?? null,
        parsedRow.SubCategory ?? null,
        parsedRow.SubSubCategory ?? null,
        parsedRow["Sales ($)"],
        parsedRow["Sales Units"],
      ]),
      normalizedData: toJsonValue(normalizedData),
    });
  }

  return {
    kind: "success",
    sourceType: "STORE",
    worksheetName: extractedWorksheet.worksheetName,
    headerRowNumber: extractedWorksheet.headerRowNumber,
    totalRowCount: rawRows.length,
    validRowCount: normalizedRows.length,
    invalidRowCount: rawRows.length - normalizedRows.length,
    rawRows,
    normalizedRows,
    validationSummary: {
      worksheetName: extractedWorksheet.worksheetName,
      headerRowNumber: extractedWorksheet.headerRowNumber,
      totalRowCount: rawRows.length,
      validRowCount: normalizedRows.length,
      invalidRowCount: rawRows.length - normalizedRows.length,
      invalidRowsSample,
    },
  };
}

export async function parseImportWorkbook({
  buffer,
  payload,
  validationContext,
}: ParseWorkbookArgs): Promise<ParsedWorkbookResult> {
  const workbook = new ExcelJS.Workbook();

  try {
    // ExcelJS still types xlsx.load() against the legacy non-generic Buffer shape.
    // @ts-expect-error Runtime accepts the Node Buffer returned by the storage adapter.
    await workbook.xlsx.load(buffer as unknown as Buffer);
  } catch (error) {
    return buildPrevalidationFailure(null, [
      `The uploaded workbook could not be parsed: ${error instanceof Error ? error.message : "unknown error"}.`,
    ]);
  }

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return buildPrevalidationFailure(null, [
      "The uploaded workbook does not contain any worksheets.",
    ]);
  }

  const requiredHeaders =
    payload.sourceType === "LP"
      ? LP_EXCEL_REQUIRED_HEADERS
      : STORE_EXCEL_REQUIRED_HEADERS;
  const extractedWorksheet = extractWorksheetData(worksheet, requiredHeaders);

  if ("kind" in extractedWorksheet) {
    return extractedWorksheet;
  }

  if (payload.sourceType === "LP") {
    return buildLpResult(extractedWorksheet, payload, validationContext);
  }

  return buildStoreResult(extractedWorksheet, payload, validationContext);
}
