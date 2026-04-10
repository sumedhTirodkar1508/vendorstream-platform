/**
 * TO BE CHANGED
 * Normalizes a barcode/GTIN for safe cross-referencing between LP and Store files.
 * Strips leading '00' from 14-digit barcodes to match 12-digit equivalents.
 */
export function normalizeBarcode(
  barcode: string | number | undefined | null,
): string | null {
  if (!barcode) return null;

  // Ensure it's a string and remove any accidental whitespace
  const strBarcode = String(barcode).trim();

  // Rule 5.2: 14-digit starting with 00 -> convert to 12-digit
  if (strBarcode.length === 14 && strBarcode.startsWith("00")) {
    return strBarcode.slice(2);
  }

  return strBarcode;
}
