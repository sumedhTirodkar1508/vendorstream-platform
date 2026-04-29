import { z } from "zod";

/**
 * Helper to safely convert Excel formatting (e.g., "$214,579.20" or "33,792") into clean numbers.
 */
const numericPreprocessor = (val: unknown) => {
  if (typeof val === "string") {
    const cleaned = val.replace(/[$,\s]/g, ""); // Strip dollar signs, commas, and spaces
    return cleaned === "" ? undefined : Number(cleaned);
  }
  return val;
};

// ==========================================
// LP MONTHLY SALES ROW SCHEMA
// ==========================================
export const LP_EXCEL_REQUIRED_HEADERS = [
  "SKU",
  "Item Name",
  "Sub Category",
  "Brand",
  "Vendor ID",
  "Vendor Name",
  "Store Name",
  "Store Address",
  "Order Date",
  "Units Sold",
  "Item Barcode",
] as const;

export const STORE_EXCEL_REQUIRED_HEADERS = [
  "SubCategory",
  "SubSubCategory",
  "Supplier/LP",
  "Brand",
  "Item Name",
  "SKU",
  "Sales ($)",
  "Sales Units",
  "OCS.ca Sales Price ($) Exclude Tax",
  "Barcode/UPC",
] as const;

export const LpExcelRowSchema = z.object({
  SKU: z.coerce.string().optional(), // Fallback match (Rule 5.3)
  "Item Name": z.coerce.string().optional(),

  // Rule 3.3: Sub Category is required for the scale rules
  "Sub Category": z.coerce.string().min(1, "Sub Category is required"),

  Brand: z.coerce.string().optional(),
  "Vendor ID": z.coerce.string().optional(),
  "Vendor Name": z.coerce.string().optional(),

  // Rule 6.2: Used for store location matching
  "Store Name": z.coerce.string().min(1, "Store Name is required"),
  "Store Address": z.coerce.string().min(1, "Store Address is required"),

  // Coerces string like "February 20, 2026" into a valid Date object
  "Order Date": z.coerce.date(),

  // Rule 7.1: LP is the truth source for quantity
  "Units Sold": z.preprocess(numericPreprocessor, z.number().min(0)),

  // Rule 5.1: Primary match key. (Coerce to string to preserve leading zeros)
  "Item Barcode": z.coerce.string().min(1, "Barcode is required"),
});

// ==========================================
// STORE MONTHLY SALES ROW SCHEMA
// ==========================================
export const StoreExcelRowSchema = z.object({
  SubCategory: z.coerce.string().optional(),
  SubSubCategory: z.coerce.string().optional(),
  "Supplier/LP": z.coerce.string().optional(),
  Brand: z.coerce.string().optional(),
  "Item Name": z.coerce.string().optional(),
  SKU: z.coerce.string().optional(), // Fallback

  // Rule 8.1: Primary Price Formula values
  "Sales ($)": z.preprocess(numericPreprocessor, z.number()),
  "Sales Units": z.preprocess(numericPreprocessor, z.number().min(0)),

  // Rule 8.2: Backup Price Formula value
  "OCS.ca Sales Price ($) Exclude Tax": z.preprocess(
    numericPreprocessor,
    z.number().optional(),
  ),

  // Rule 5.1: Primary match key
  "Barcode/UPC": z.coerce.string().min(1, "Barcode is required"),
});

export type LpExcelRow = z.infer<typeof LpExcelRowSchema>;
export type StoreExcelRow = z.infer<typeof StoreExcelRowSchema>;
