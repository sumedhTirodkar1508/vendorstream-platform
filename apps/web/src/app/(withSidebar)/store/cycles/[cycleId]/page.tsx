import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type BatchSourceType,
  type CycleStatus,
  type ImportBatchStatus,
  type StatementStatus,
  type StatementTaskStatus,
} from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { PageErrorState } from "@/components/page-error-state";
import { formatMonthLabel } from "@/lib/format";
import { getStoreUploadContextForUser } from "@/lib/store-upload-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type UploadState = "NOT_UPLOADED" | "VALIDATING" | "UPLOADED" | "FAILED";
type StatementState = "NOT_READY" | "PENDING" | "GENERATING" | "READY" | "FAILED";
type TimelineTone = "neutral" | "success" | "warning" | "failed";

type RelatedUploadRow = {
  id: string;
  sourceType: BatchSourceType;
  fileName: string;
  uploadedAt: Date | null;
  status: ImportBatchStatus;
  totalRows: number | null;
  validRows: number | null;
  invalidRows: number | null;
  uploaderName: string;
  uploaderEmail: string | null;
};

type TimelineEvent = {
  id: string;
  title: string;
  description: string;
  occurredAt: Date | null;
  tone: TimelineTone;
};

type StoreCycleDetailsState =
  | {
      kind: "ready";
      cycle: {
        id: string;
        lpId: string;
        lpName: string;
        storeOrganizationName: string;
        storeLocationId: string;
        storeLocationName: string;
        month: Date;
        status: CycleStatus;
        createdAt: Date;
        updatedAt: Date;
        reconciliationPassedAt: Date | null;
        statementReadyAt: Date | null;
        lastError: string | null;
        uploads: {
          lpPresent: boolean;
          lpStatus: UploadState;
          lpBatchId: string | null;
          storePresent: boolean;
          storeStatus: UploadState;
          storeBatchId: string | null;
        };
        mismatches: {
          total: number;
          open: number;
          resolved: number;
          waived: number;
          duplicates: number;
          missingCounterparts: number;
          fieldDifferences: number;
          barcodeIssues: number;
          pricingFormulaFallbacks: number;
          manualReview: number;
        };
        statement: {
          status: StatementState;
          statementId: string | null;
          version: number | null;
          generatedAt: Date | null;
          taskStatus: StatementTaskStatus | null;
          taskCompletedAt: Date | null;
          taskStartedAt: Date | null;
          taskAttemptCount: number | null;
          taskLastError: string | null;
        };
        timeline: TimelineEvent[];
        relatedUploads: RelatedUploadRow[];
      };
    }
  | {
      kind: "missing";
      cycleId: string;
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "error";
      message: string;
    };

const FAILED_BATCH_STATUSES: ImportBatchStatus[] = [
  "PREVALIDATION_FAILED",
  "VALIDATION_FAILED",
  "FAILED",
  "CANCELED",
];

const VALIDATING_BATCH_STATUSES: ImportBatchStatus[] = [
  "RECEIVED",
  "VALIDATING",
  "STAGED",
];

function formatMonth(date: Date) {
  return formatMonthLabel(date);
}

function formatDateTime(date: Date | null) {
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

function formatCycleStatus(status: CycleStatus) {
  return status.replaceAll("_", " ");
}

function formatBatchStatus(status: ImportBatchStatus) {
  return status.replaceAll("_", " ");
}

function formatUploadState(status: UploadState) {
  if (status === "NOT_UPLOADED") {
    return "Not uploaded";
  }

  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatStatementState(status: StatementState) {
  if (status === "NOT_READY") {
    return "Not ready";
  }

  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatSourceType(value: BatchSourceType) {
  return value === "LP" ? "LP" : "Store";
}

function formatStatementTaskStatus(status: StatementTaskStatus | null) {
  if (!status) {
    return "Not available";
  }

  return status.replaceAll("_", " ");
}

function getCycleTone(status: CycleStatus) {
  if (status === "STATEMENT_READY" || status === "RECONCILIATION_PASSED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "MISMATCHES_FOUND" || status === "AWAITING_UPLOADS") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getUploadTone(status: UploadState) {
  if (status === "UPLOADED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "NOT_UPLOADED") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getStatementTone(status: StatementState) {
  if (status === "READY") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "PENDING" || status === "GENERATING") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function StatusBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
}) {
  const accentClass =
    tone === "success"
      ? "from-emerald-400/20 to-transparent"
      : tone === "warning"
        ? "from-amber-400/20 to-transparent"
        : "from-cyan-400/20 to-transparent";

  return (
    <Card className="relative border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${accentClass}`}
      />
      <CardHeader className="relative space-y-2">
        <CardDescription className="text-xs uppercase tracking-[0.18em] text-slate-300">
          {label}
        </CardDescription>
        <CardTitle className="text-4xl font-semibold tracking-tight text-white">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <p className="text-sm leading-6 text-slate-300">{detail}</p>
      </CardContent>
    </Card>
  );
}

function deriveUploadState(status: ImportBatchStatus | undefined): UploadState {
  if (!status) {
    return "NOT_UPLOADED";
  }

  if (FAILED_BATCH_STATUSES.includes(status)) {
    return "FAILED";
  }

  if (VALIDATING_BATCH_STATUSES.includes(status)) {
    return "VALIDATING";
  }

  return "UPLOADED";
}

function deriveStatementState({
  cycleStatus,
  statementStatus,
  statementTaskStatus,
}: {
  cycleStatus: CycleStatus;
  statementStatus: StatementStatus | undefined;
  statementTaskStatus: StatementTaskStatus | undefined;
}): StatementState {
  if (statementStatus === "FINAL" || cycleStatus === "STATEMENT_READY") {
    return "READY";
  }

  if (
    statementStatus === "FAILED" ||
    statementTaskStatus === "FAILED" ||
    cycleStatus === "FAILED"
  ) {
    return "FAILED";
  }

  if (
    statementTaskStatus === "PROCESSING" ||
    cycleStatus === "STATEMENT_GENERATING"
  ) {
    return "GENERATING";
  }

  if (
    statementStatus === "DRAFT" ||
    statementTaskStatus === "PENDING" ||
    statementTaskStatus === "COMPLETED" ||
    cycleStatus === "STATEMENT_PENDING"
  ) {
    return "PENDING";
  }

  return "NOT_READY";
}

function buildTimeline(cycle: {
  createdAt: Date;
  updatedAt: Date;
  reconciliationPassedAt: Date | null;
  statementReadyAt: Date | null;
  lastError: string | null;
  importBatches: Array<{
    id: string;
    sourceType: BatchSourceType;
    status: ImportBatchStatus;
    processedAt: Date | null;
    failedAt: Date | null;
    uploadedFile: {
      uploadedAt: Date | null;
      originalFilename: string;
    };
  }>;
  statements: Array<{
    generatedAt: Date | null;
  }>;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: "cycle-created",
      title: "Cycle created",
      description: "VendorStream opened the reconciliation cycle for this month.",
      occurredAt: cycle.createdAt,
      tone: "neutral",
    },
  ];

  const sortedBatches = [...cycle.importBatches].sort((a, b) => {
    const aTime = a.uploadedFile.uploadedAt?.getTime() ?? 0;
    const bTime = b.uploadedFile.uploadedAt?.getTime() ?? 0;
    return aTime - bTime;
  });

  for (const batch of sortedBatches) {
    events.push({
      id: `upload-${batch.id}`,
      title: `${formatSourceType(batch.sourceType)} upload received`,
      description: `${batch.uploadedFile.originalFilename} was attached to this cycle.`,
      occurredAt: batch.uploadedFile.uploadedAt,
      tone: "neutral",
    });

    if (batch.processedAt) {
      events.push({
        id: `processed-${batch.id}`,
        title: `${formatSourceType(batch.sourceType)} batch processed`,
        description: "Validation and normalization completed for this upload batch.",
        occurredAt: batch.processedAt,
        tone: "success",
      });
    }

    if (batch.failedAt) {
      events.push({
        id: `failed-${batch.id}`,
        title: `${formatSourceType(batch.sourceType)} batch failed`,
        description: "This batch encountered a validation or processing failure.",
        occurredAt: batch.failedAt,
        tone: "failed",
      });
    }
  }

  if (cycle.reconciliationPassedAt) {
    events.push({
      id: "reconciliation-passed",
      title: "Reconciliation passed",
      description: "The cycle reached a successful reconciliation outcome.",
      occurredAt: cycle.reconciliationPassedAt,
      tone: "success",
    });
  }

  if (cycle.statementReadyAt) {
    events.push({
      id: "statement-ready",
      title: "Statement ready",
      description: "A statement became available for this cycle.",
      occurredAt: cycle.statementReadyAt,
      tone: "success",
    });
  }

  const generatedAt = cycle.statements[0]?.generatedAt ?? null;

  if (generatedAt) {
    events.push({
      id: "statement-generated",
      title: "Statement generated",
      description: "The latest statement version was generated.",
      occurredAt: generatedAt,
      tone: "success",
    });
  }

  if (cycle.lastError) {
    events.push({
      id: "cycle-error",
      title: "Cycle error recorded",
      description: cycle.lastError,
      occurredAt: cycle.updatedAt,
      tone: "failed",
    });
  } else if (!cycle.reconciliationPassedAt && !cycle.statementReadyAt) {
    events.push({
      id: "cycle-updated",
      title: "Latest cycle activity",
      description: "Most recent operational update recorded on this cycle.",
      occurredAt: cycle.updatedAt,
      tone: "warning",
    });
  }

  return events
    .filter((event) => event.occurredAt !== null)
    .sort((a, b) => {
      const aTime = a.occurredAt?.getTime() ?? 0;
      const bTime = b.occurredAt?.getTime() ?? 0;
      return aTime - bTime;
    });
}

async function getStoreCycleDetailsState(
  cycleId: string,
): Promise<StoreCycleDetailsState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    redirect("/login");
  }

  try {
    const context = await getStoreUploadContextForUser({
      userId: session.user.id,
      systemRole: session.user.systemRole,
    });

    const allowedPairs = new Set(
      context.options.map((option) => `${option.lpId}:${option.storeLocationId}`),
    );

    const cycle = await prisma.reconciliationCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        lpId: true,
        storeLocationId: true,
        periodMonth: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        reconciliationPassedAt: true,
        statementReadyAt: true,
        lastError: true,
        lp: {
          select: {
            name: true,
          },
        },
        storeLocation: {
          select: {
            name: true,
            storeOrganization: {
              select: {
                name: true,
              },
            },
          },
        },
        importBatches: {
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            sourceType: true,
            status: true,
            totalRowCount: true,
            validRowCount: true,
            invalidRowCount: true,
            processedAt: true,
            failedAt: true,
            uploadedBy: {
              select: {
                name: true,
                email: true,
              },
            },
            uploadedFile: {
              select: {
                originalFilename: true,
                uploadedAt: true,
              },
            },
          },
        },
        mismatches: {
          select: {
            status: true,
            type: true,
          },
        },
        statementTasks: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          select: {
            status: true,
            startedAt: true,
            completedAt: true,
            attemptCount: true,
            lastError: true,
          },
        },
        statements: {
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            version: true,
            status: true,
            generatedAt: true,
          },
        },
      },
    });

    if (!cycle) {
      return {
        kind: "missing",
        cycleId,
      };
    }

    const isAdmin = session.user.systemRole === "ADMIN";
    const pairKey = `${cycle.lpId}:${cycle.storeLocationId}`;

    if (!isAdmin && !allowedPairs.has(pairKey)) {
      return { kind: "forbidden" };
    }

    const currentLpBatch =
      cycle.importBatches.find((batch) => batch.sourceType === "LP") ?? null;
    const currentStoreBatch =
      cycle.importBatches.find((batch) => batch.sourceType === "STORE") ?? null;
    const latestStatement = cycle.statements[0] ?? null;
    const latestTask = cycle.statementTasks[0] ?? null;

    const mismatchCounts = cycle.mismatches.reduce(
      (accumulator, mismatch) => {
        accumulator.total += 1;

        if (mismatch.status === "OPEN") {
          accumulator.open += 1;
        }

        if (mismatch.status === "RESOLVED") {
          accumulator.resolved += 1;
        }

        if (mismatch.status === "WAIVED") {
          accumulator.waived += 1;
        }

        if (mismatch.type === "DUPLICATE_ROW") {
          accumulator.duplicates += 1;
        }

        if (mismatch.type === "MISSING_COUNTERPART") {
          accumulator.missingCounterparts += 1;
        }

        if (mismatch.type === "FIELD_DIFFERENCE") {
          accumulator.fieldDifferences += 1;
        }

        if (mismatch.type === "BARCODE_NORMALIZATION_REQUIRED") {
          accumulator.barcodeIssues += 1;
        }

        if (mismatch.type === "PRICE_FORMULA_FALLBACK") {
          accumulator.pricingFormulaFallbacks += 1;
        }

        if (mismatch.type === "MANUAL_REVIEW_REQUIRED") {
          accumulator.manualReview += 1;
        }

        return accumulator;
      },
      {
        total: 0,
        open: 0,
        resolved: 0,
        waived: 0,
        duplicates: 0,
        missingCounterparts: 0,
        fieldDifferences: 0,
        barcodeIssues: 0,
        pricingFormulaFallbacks: 0,
        manualReview: 0,
      },
    );

    return {
      kind: "ready",
      cycle: {
        id: cycle.id,
        lpId: cycle.lpId,
        lpName: cycle.lp.name,
        storeOrganizationName: cycle.storeLocation.storeOrganization.name,
        storeLocationId: cycle.storeLocationId,
        storeLocationName: cycle.storeLocation.name,
        month: cycle.periodMonth,
        status: cycle.status,
        createdAt: cycle.createdAt,
        updatedAt: cycle.updatedAt,
        reconciliationPassedAt: cycle.reconciliationPassedAt,
        statementReadyAt: cycle.statementReadyAt,
        lastError: cycle.lastError,
        uploads: {
          lpPresent: Boolean(currentLpBatch),
          lpStatus: deriveUploadState(currentLpBatch?.status),
          lpBatchId: currentLpBatch?.id ?? null,
          storePresent: Boolean(currentStoreBatch),
          storeStatus: deriveUploadState(currentStoreBatch?.status),
          storeBatchId: currentStoreBatch?.id ?? null,
        },
        mismatches: mismatchCounts,
        statement: {
          status: deriveStatementState({
            cycleStatus: cycle.status,
            statementStatus: latestStatement?.status,
            statementTaskStatus: latestTask?.status,
          }),
          statementId: latestStatement?.id ?? null,
          version: latestStatement?.version ?? null,
          generatedAt: latestStatement?.generatedAt ?? null,
          taskStatus: latestTask?.status ?? null,
          taskCompletedAt: latestTask?.completedAt ?? null,
          taskStartedAt: latestTask?.startedAt ?? null,
          taskAttemptCount: latestTask?.attemptCount ?? null,
          taskLastError: latestTask?.lastError ?? null,
        },
        timeline: buildTimeline(cycle),
        relatedUploads: cycle.importBatches.map((batch) => ({
          id: batch.id,
          sourceType: batch.sourceType,
          fileName: batch.uploadedFile.originalFilename,
          uploadedAt: batch.uploadedFile.uploadedAt,
          status: batch.status,
          totalRows: batch.totalRowCount,
          validRows: batch.validRowCount,
          invalidRows: batch.invalidRowCount,
          uploaderName:
            batch.uploadedBy?.name ||
            batch.uploadedBy?.email ||
            "Unknown uploader",
          uploaderEmail: batch.uploadedBy?.email ?? null,
        })),
      },
    };
  } catch (error) {
    console.error("Failed to load store cycle details", error);

    return {
      kind: "error",
      message:
        "We could not load this store reconciliation cycle right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

export default async function StoreCycleDetailsPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = await params;
  const state = await getStoreCycleDetailsState(cycleId);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            Store Cycle Details
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Reconciliation cycle details
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review one store-side reconciliation cycle, including upload readiness,
              mismatch pressure, statement progress, and related batch history.
            </p>
          </div>
        </header>

        {state.kind === "missing" ? (
          <PageErrorState
            variant="missing"
            badgeLabel="Cycle not found"
            title="No store reconciliation cycle matched this identifier"
            description={
              <>
                The cycle ID <span className="font-medium text-white">{state.cycleId}</span>{" "}
                is not available in the current store workspace.
              </>
            }
            actions={
              <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
                <Link href="/store/cycles">Back to store cycles</Link>
              </Button>
            }
          />
        ) : null}
        {state.kind === "forbidden" ? (
          <PageErrorState
            variant="forbidden"
            title="You do not have access to this cycle"
            description="This reconciliation cycle does not belong to a store location in your current access scope."
            actions={
              <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
                <Link href="/store/cycles">Back to store cycles</Link>
              </Button>
            }
          />
        ) : null}
        {state.kind === "error" ? (
          <PageErrorState
            variant="error"
            badgeLabel="Cycle unavailable"
            title="Store reconciliation cycle details could not be loaded"
            description={state.message}
            actions={
              <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
                <Link href="/store/cycles">Back to store cycles</Link>
              </Button>
            }
          />
        ) : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
                      {formatMonth(state.cycle.month)}
                    </div>
                    <StatusBadge
                      label={formatCycleStatus(state.cycle.status)}
                      className={getCycleTone(state.cycle.status)}
                    />
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-3xl text-white">
                      {state.cycle.lpName}
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      {state.cycle.storeOrganizationName} ·{" "}
                      {state.cycle.storeLocationName}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  <DetailRow label="Cycle ID" value={state.cycle.id} />
                  <DetailRow
                    label="Month"
                    value={formatMonth(state.cycle.month)}
                  />
                  <DetailRow label="LP" value={state.cycle.lpName} />
                  <DetailRow
                    label="Store organization"
                    value={state.cycle.storeOrganizationName}
                  />
                  <DetailRow
                    label="Store location"
                    value={state.cycle.storeLocationName}
                  />
                  <DetailRow
                    label="Cycle status"
                    value={
                      <StatusBadge
                        label={formatCycleStatus(state.cycle.status)}
                        className={getCycleTone(state.cycle.status)}
                      />
                    }
                  />
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">Actions</CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Continue from this cycle into mismatch review, statement context,
                    or related upload history.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
                    <Link href="/store/cycles">Back to store cycles</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Link href={`/store/cycles/${state.cycle.id}/mismatches`}>
                      Review mismatches
                    </Link>
                  </Button>
                  {state.cycle.statement.statementId ? (
                    <Button
                      asChild
                      variant="outline"
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      <Link
                        href={`/store/statements/${state.cycle.statement.statementId}`}
                      >
                        View statement
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      className="border-white/15 bg-white/5 text-white disabled:text-slate-500"
                    >
                      View statement
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled
                    className="text-slate-300 disabled:text-slate-500"
                  >
                    Reprocess cycle
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="LP Upload"
                value={state.cycle.uploads.lpPresent ? "Present" : "Missing"}
                detail={
                  state.cycle.uploads.lpPresent
                    ? "A current LP-side batch is attached to this cycle."
                    : "No current LP upload is attached yet."
                }
                tone={state.cycle.uploads.lpPresent ? "success" : "warning"}
              />
              <SummaryCard
                label="Store Upload"
                value={state.cycle.uploads.storePresent ? "Present" : "Missing"}
                detail={
                  state.cycle.uploads.storePresent
                    ? "A current store-side batch is attached to this cycle."
                    : "The store-side upload is still missing."
                }
                tone={state.cycle.uploads.storePresent ? "success" : "warning"}
              />
              <SummaryCard
                label="Open Mismatches"
                value={String(state.cycle.mismatches.open)}
                detail="Mismatch items still requiring store-side review or resolution."
                tone={state.cycle.mismatches.open > 0 ? "warning" : "success"}
              />
              <SummaryCard
                label="Statement"
                value={formatStatementState(state.cycle.statement.status)}
                detail="Latest statement readiness derived from the current statement and task state."
                tone={
                  state.cycle.statement.status === "READY"
                    ? "success"
                    : state.cycle.statement.status === "FAILED"
                      ? "warning"
                      : "neutral"
                }
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Upload status summary
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Current LP and store upload presence plus the most recent batch state.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DetailRow
                    label="LP upload present"
                    value={state.cycle.uploads.lpPresent ? "Yes" : "No"}
                  />
                  <DetailRow
                    label="LP batch status"
                    value={
                      <StatusBadge
                        label={formatUploadState(state.cycle.uploads.lpStatus)}
                        className={getUploadTone(state.cycle.uploads.lpStatus)}
                      />
                    }
                  />
                  <DetailRow
                    label="Current LP batch"
                    value={
                      state.cycle.uploads.lpBatchId ? (
                        <Link
                          href={`/store/uploads?batchId=${state.cycle.uploads.lpBatchId}`}
                          className="text-cyan-200 hover:text-cyan-100"
                        >
                          Open batch record
                        </Link>
                      ) : (
                        "Not available"
                      )
                    }
                  />
                  <DetailRow
                    label="Store upload present"
                    value={state.cycle.uploads.storePresent ? "Yes" : "No"}
                  />
                  <DetailRow
                    label="Store batch status"
                    value={
                      <StatusBadge
                        label={formatUploadState(state.cycle.uploads.storeStatus)}
                        className={getUploadTone(state.cycle.uploads.storeStatus)}
                      />
                    }
                  />
                  <DetailRow
                    label="Current store batch"
                    value={
                      state.cycle.uploads.storeBatchId ? (
                        <Link
                          href={`/store/uploads?batchId=${state.cycle.uploads.storeBatchId}`}
                          className="text-cyan-200 hover:text-cyan-100"
                        >
                          Open batch record
                        </Link>
                      ) : (
                        "Not available"
                      )
                    }
                  />
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Processing timeline
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Timeline is derived from real cycle and upload timestamps.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {state.cycle.timeline.map((event) => (
                    <div
                      key={event.id}
                      className="flex gap-4 rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                    >
                      <div className="mt-1">
                        <div
                          className={`h-3 w-3 rounded-full ${
                            event.tone === "success"
                              ? "bg-emerald-300"
                              : event.tone === "warning"
                                ? "bg-amber-300"
                                : event.tone === "failed"
                                  ? "bg-red-300"
                                  : "bg-cyan-300"
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-sm font-medium text-white">
                          {event.title}
                        </div>
                        <div className="text-sm leading-6 text-slate-300">
                          {event.description}
                        </div>
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          {formatDateTime(event.occurredAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card
                id="mismatch-summary"
                className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
              >
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Mismatch summary
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Open, resolved, and waived mismatch counts grouped from real
                    mismatch records on this cycle.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  <DetailRow label="Total mismatches" value={state.cycle.mismatches.total} />
                  <DetailRow label="Open" value={state.cycle.mismatches.open} />
                  <DetailRow
                    label="Resolved"
                    value={state.cycle.mismatches.resolved}
                  />
                  <DetailRow label="Waived" value={state.cycle.mismatches.waived} />
                  <DetailRow
                    label="Duplicate rows"
                    value={state.cycle.mismatches.duplicates}
                  />
                  <DetailRow
                    label="Missing counterparts"
                    value={state.cycle.mismatches.missingCounterparts}
                  />
                  <DetailRow
                    label="Field differences"
                    value={state.cycle.mismatches.fieldDifferences}
                  />
                  <DetailRow
                    label="Barcode issues"
                    value={state.cycle.mismatches.barcodeIssues}
                  />
                  <DetailRow
                    label="Price fallback issues"
                    value={state.cycle.mismatches.pricingFormulaFallbacks}
                  />
                  <DetailRow
                    label="Manual review required"
                    value={state.cycle.mismatches.manualReview}
                  />
                </CardContent>
              </Card>

              <Card
                id="statement-summary"
                className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
              >
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Statement summary
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Statement readiness derived from the latest statement and
                    statement-generation task on this cycle.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <DetailRow
                    label="Statement status"
                    value={
                      <StatusBadge
                        label={formatStatementState(state.cycle.statement.status)}
                        className={getStatementTone(state.cycle.statement.status)}
                      />
                    }
                  />
                  <DetailRow
                    label="Latest statement"
                    value={
                      state.cycle.statement.statementId
                        ? `${state.cycle.statement.statementId}${
                            state.cycle.statement.version
                              ? ` · v${state.cycle.statement.version}`
                              : ""
                          }`
                        : "Not available"
                    }
                  />
                  <DetailRow
                    label="Generated at"
                    value={formatDateTime(state.cycle.statement.generatedAt)}
                  />
                  <DetailRow
                    label="Task status"
                    value={formatStatementTaskStatus(state.cycle.statement.taskStatus)}
                  />
                  <DetailRow
                    label="Task started"
                    value={formatDateTime(state.cycle.statement.taskStartedAt)}
                  />
                  <DetailRow
                    label="Task completed"
                    value={formatDateTime(state.cycle.statement.taskCompletedAt)}
                  />
                  <DetailRow
                    label="Attempt count"
                    value={state.cycle.statement.taskAttemptCount ?? "Not available"}
                  />
                  <DetailRow
                    label="Task error"
                    value={state.cycle.statement.taskLastError ?? "Not available"}
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Related uploads
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  All import batches linked to this reconciliation cycle.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.cycle.relatedUploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                  >
                    <div className="grid gap-4 xl:grid-cols-[0.6fr_1.2fr_0.9fr_0.8fr_0.9fr_auto] xl:items-start">
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Source type
                        </div>
                        <div className="text-sm font-medium text-white">
                          {formatSourceType(upload.sourceType)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          File name
                        </div>
                        <div className="text-sm text-slate-300">
                          {upload.fileName}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Uploaded at
                        </div>
                        <div className="text-sm text-slate-300">
                          {formatDateTime(upload.uploadedAt)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Status
                        </div>
                        <StatusBadge
                          label={formatBatchStatus(upload.status)}
                          className={
                            upload.sourceType === "LP"
                              ? getUploadTone(
                                  deriveUploadState(upload.status),
                                )
                              : getUploadTone(
                                  deriveUploadState(upload.status),
                                )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Row counts
                        </div>
                        <div className="text-sm text-slate-300">
                          {upload.totalRows ?? "N/A"} total · {upload.validRows ?? "N/A"} valid
                          {" · "}
                          {upload.invalidRows ?? "N/A"} invalid
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                        >
                          <Link href={`/store/uploads?batchId=${upload.id}`}>
                            Go to upload batch details
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </main>
  );
}
