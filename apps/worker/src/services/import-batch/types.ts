import type { Prisma } from "@vendorstream/database";

export type PrevalidationFailure = {
  kind: "prevalidation-failure";
  errors: string[];
  details: Prisma.InputJsonObject;
};

type RawRowDraft = {
  id: string;
  sourceRowNumber: number;
  rawData: Prisma.InputJsonValue;
  parseErrors?: Prisma.InputJsonValue;
};

type NormalizedRowDraft = {
  id: string;
  rawRowId: string;
  sourceRowNumber: number;
  canonicalBarcode: string | null;
  barcodeNormalized: boolean;
  productName: string | null;
  categoryKey: string | null;
  subCategoryKey: string | null;
  salesAmount: number | null;
  salesUnits: number | null;
  unitPricePrimary: number | null;
  unitPriceFallback: number | null;
  finalUnitPrice: number | null;
  usedFallbackPrice: boolean;
  rowFingerprint: string | null;
  normalizedData: Prisma.InputJsonValue;
};

export type ParsedLpWorkbook = {
  kind: "success";
  sourceType: "LP";
  worksheetName: string;
  headerRowNumber: number;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  rawRows: RawRowDraft[];
  normalizedRows: NormalizedRowDraft[];
  validationSummary: Prisma.InputJsonObject;
};

export type ParsedStoreWorkbook = {
  kind: "success";
  sourceType: "STORE";
  worksheetName: string;
  headerRowNumber: number;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  rawRows: RawRowDraft[];
  normalizedRows: NormalizedRowDraft[];
  validationSummary: Prisma.InputJsonObject;
};

export type ParsedWorkbookResult =
  | PrevalidationFailure
  | ParsedLpWorkbook
  | ParsedStoreWorkbook;
