type NumericValue =
  | { toNumber?: () => number }
  | bigint
  | number
  | string
  | null
  | undefined;

type DateValue = Date | string | null | undefined;

function toFiniteNumber(value: NumericValue) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "bigint") {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }

    return Number(value);
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : typeof value.toNumber === "function"
          ? value.toNumber()
          : Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function toDate(value: DateValue) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  if (/^\d{4}-\d{2}$/.test(normalizedValue)) {
    const [year, month] = normalizedValue
      .split("-")
      .map((part) => Number(part));
    const parsed = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(normalizedValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatEnumLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function formatMonthLabel(value: DateValue) {
  const date = toDate(value);

  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTime(value: DateValue) {
  const date = toDate(value);

  if (!date) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatCurrency(
  value: NumericValue,
  currency = "CAD",
  options?: {
    fallback?: string;
  },
) {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return options?.fallback ?? "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

export function formatNumber(
  value: NumericValue,
  options?: {
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    fallback?: string;
  },
) {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return options?.fallback ?? "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  }).format(numericValue);
}

export function formatPercent(
  value: NumericValue,
  options?: {
    scale?: "whole" | "fraction";
    maximumFractionDigits?: number;
    fallback?: string;
  },
) {
  const numericValue = toFiniteNumber(value);

  if (numericValue === null) {
    return options?.fallback ?? "N/A";
  }

  const percentValue =
    options?.scale === "fraction" ? numericValue * 100 : numericValue;

  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  }).format(percentValue)}%`;
}

export function formatFileSize(
  value: bigint | number | null | undefined,
  options?: {
    fallback?: string;
  },
) {
  if (value === null || value === undefined) {
    return options?.fallback ?? "Not available";
  }

  const asNumber =
    typeof value === "bigint"
      ? value <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(value)
        : null
      : Number.isFinite(value)
        ? value
        : null;

  if (asNumber === null) {
    return `${value.toString()} bytes`;
  }

  if (asNumber >= 1024 * 1024 * 1024) {
    return `${(asNumber / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  if (asNumber >= 1024 * 1024) {
    return `${(asNumber / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (asNumber >= 1024) {
    return `${(asNumber / 1024).toFixed(1)} KB`;
  }

  return `${asNumber} bytes`;
}
