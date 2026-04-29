import type {
  CycleStatus,
  ImportBatchStatus,
  NotificationStatus,
  StatementStatus,
  $Enums,
} from "@vendorstream/database";

type MismatchStatus = $Enums.MismatchStatus;
type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const BADGE_TONE_CLASS_NAMES: Record<BadgeTone, string> = {
  neutral: "border-white/10 bg-white/5 text-slate-200",
  info: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  warning: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  danger: "border-red-400/30 bg-red-500/10 text-red-100",
};

export function getBadgeToneClassName(tone: BadgeTone) {
  return BADGE_TONE_CLASS_NAMES[tone];
}

export function getCycleStatusBadgeTone(status: CycleStatus): BadgeTone {
  if (status === "STATEMENT_READY" || status === "RECONCILIATION_PASSED") {
    return "success";
  }

  if (status === "FAILED") {
    return "danger";
  }

  if (status === "MISMATCHES_FOUND" || status === "AWAITING_UPLOADS") {
    return "warning";
  }

  if (
    status === "PROCESSING" ||
    status === "READY_FOR_RECONCILIATION" ||
    status === "RECONCILING" ||
    status === "STATEMENT_GENERATING"
  ) {
    return "info";
  }

  return "neutral";
}

export function getCycleStatusBadgeClassName(status: CycleStatus) {
  return getBadgeToneClassName(getCycleStatusBadgeTone(status));
}

export function getImportBatchStatusBadgeTone(
  status: ImportBatchStatus,
): BadgeTone {
  if (status === "RECONCILED" || status === "READY_FOR_RECONCILIATION") {
    return "success";
  }

  if (
    status === "FAILED" ||
    status === "VALIDATION_FAILED" ||
    status === "PREVALIDATION_FAILED" ||
    status === "CANCELED"
  ) {
    return "danger";
  }

  if (
    status === "WAITING_FOR_COUNTERPART" ||
    status === "RECEIVED" ||
    status === "VALIDATING"
  ) {
    return "warning";
  }

  if (status === "STAGED" || status === "RECONCILING") {
    return "info";
  }

  return "neutral";
}

export function getImportBatchStatusBadgeClassName(status: ImportBatchStatus) {
  return getBadgeToneClassName(getImportBatchStatusBadgeTone(status));
}

export function getStatementStatusBadgeTone(status: StatementStatus): BadgeTone {
  if (status === "FINAL") {
    return "success";
  }

  if (status === "FAILED") {
    return "danger";
  }

  return "warning";
}

export function getStatementStatusBadgeClassName(status: StatementStatus) {
  return getBadgeToneClassName(getStatementStatusBadgeTone(status));
}

export function getMismatchStatusBadgeTone(status: MismatchStatus): BadgeTone {
  if (status === "RESOLVED") {
    return "success";
  }

  if (status === "WAIVED") {
    return "warning";
  }

  return "neutral";
}

export function getMismatchStatusBadgeClassName(status: MismatchStatus) {
  return getBadgeToneClassName(getMismatchStatusBadgeTone(status));
}

export function getNotificationStatusBadgeTone(
  status: NotificationStatus,
): BadgeTone {
  if (status === "SENT") {
    return "success";
  }

  if (status === "FAILED") {
    return "danger";
  }

  return "warning";
}

export function getNotificationStatusBadgeClassName(status: NotificationStatus) {
  return getBadgeToneClassName(getNotificationStatusBadgeTone(status));
}
