import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CycleStatus =
  | "AWAITING_UPLOADS"
  | "PROCESSING"
  | "READY_FOR_RECONCILIATION"
  | "RECONCILING"
  | "MISMATCHES_FOUND"
  | "RECONCILIATION_PASSED"
  | "STATEMENT_PENDING"
  | "STATEMENT_GENERATING"
  | "STATEMENT_READY"
  | "FAILED";

type UploadState = "NOT_UPLOADED" | "UPLOADED" | "VALIDATING" | "FAILED";
type StatementState = "NOT_READY" | "PENDING" | "GENERATING" | "READY" | "FAILED";
type TimelineEventTone = "completed" | "active" | "pending" | "warning" | "failed";

type CycleDetails = {
  id: string;
  lpName: string;
  lpCode: string;
  storeOrganization: string;
  storeLocation: string;
  month: string;
  cycleStatus: CycleStatus;
  createdAt: string;
  updatedAt: string;
  reconciliationStartedAt: string | null;
  reconciliationCompletedAt: string | null;
  uploads: {
    lp: {
      status: UploadState;
      fileName: string | null;
      uploadedAt: string | null;
      uploadedBy: string | null;
      totalRows: number | null;
      validRows: number | null;
      invalidRows: number | null;
    };
    store: {
      status: UploadState;
      fileName: string | null;
      uploadedAt: string | null;
      uploadedBy: string | null;
      totalRows: number | null;
      validRows: number | null;
      invalidRows: number | null;
    };
  };
  timeline: Array<{
    id: string;
    title: string;
    description: string;
    timestamp: string | null;
    tone: TimelineEventTone;
  }>;
  mismatches: {
    total: number;
    unresolved: number;
    resolved: number;
    duplicates: number;
    missingCounterparts: number;
    fieldDifferences: number;
    barcodeIssues: number;
    pricingIssues: number;
    lastReviewedAt: string | null;
  };
  statement: {
    status: StatementState;
    statementId: string | null;
    generatedAt: string | null;
    lastAttemptAt: string | null;
    reason: string;
  };
  actions: {
    canReviewMismatches: boolean;
    canViewStatement: boolean;
    canReprocess: boolean;
  };
};

type CycleDetailsState =
  | {
      kind: "ready";
      cycle: CycleDetails;
    }
  | {
      kind: "missing";
      cycleId: string;
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "loading";
    };

const mockCycles: CycleDetails[] = [
  {
    id: "cycle_apr_downtown",
    lpName: "Northstar Beverage Group",
    lpCode: "LP-204",
    storeOrganization: "Maple Retail Group",
    storeLocation: "Toronto Downtown",
    month: "2026-04",
    cycleStatus: "MISMATCHES_FOUND",
    createdAt: "Apr 1, 2026 08:10 AM",
    updatedAt: "Apr 9, 2026 04:42 PM",
    reconciliationStartedAt: "Apr 8, 2026 10:02 AM",
    reconciliationCompletedAt: null,
    uploads: {
      lp: {
        status: "UPLOADED",
        fileName: "northstar_lp_apr_2026.xlsx",
        uploadedAt: "Apr 8, 2026 09:14 AM",
        uploadedBy: "Avery Chen",
        totalRows: 412,
        validRows: 405,
        invalidRows: 7,
      },
      store: {
        status: "UPLOADED",
        fileName: "maple_downtown_store_apr_2026.xlsx",
        uploadedAt: "Apr 8, 2026 09:37 AM",
        uploadedBy: "Dana Brooks",
        totalRows: 409,
        validRows: 406,
        invalidRows: 3,
      },
    },
    timeline: [
      {
        id: "cycle-created",
        title: "Cycle opened",
        description: "VendorStream opened the April cycle for LP and store matching.",
        timestamp: "Apr 1, 2026 08:10 AM",
        tone: "completed",
      },
      {
        id: "lp-upload",
        title: "LP upload received",
        description: "The licensed producer workbook was accepted and validated.",
        timestamp: "Apr 8, 2026 09:14 AM",
        tone: "completed",
      },
      {
        id: "store-upload",
        title: "Store counterpart upload received",
        description: "The store workbook was accepted and queued for reconciliation.",
        timestamp: "Apr 8, 2026 09:37 AM",
        tone: "completed",
      },
      {
        id: "reconciliation",
        title: "Reconciliation run in progress",
        description: "Mismatch triage is active for row-level comparison issues.",
        timestamp: "Apr 8, 2026 10:02 AM",
        tone: "active",
      },
      {
        id: "statement",
        title: "Statement generation blocked",
        description: "Statement remains pending until open mismatches are resolved.",
        timestamp: null,
        tone: "warning",
      },
    ],
    mismatches: {
      total: 6,
      unresolved: 4,
      resolved: 2,
      duplicates: 1,
      missingCounterparts: 2,
      fieldDifferences: 2,
      barcodeIssues: 1,
      pricingIssues: 0,
      lastReviewedAt: "Apr 9, 2026 04:42 PM",
    },
    statement: {
      status: "PENDING",
      statementId: null,
      generatedAt: null,
      lastAttemptAt: "Apr 8, 2026 11:20 AM",
      reason: "Automatic statement generation is waiting for mismatch resolution.",
    },
    actions: {
      canReviewMismatches: true,
      canViewStatement: false,
      canReprocess: true,
    },
  },
  {
    id: "cycle_mar_mississauga",
    lpName: "Northstar Beverage Group",
    lpCode: "LP-204",
    storeOrganization: "Summit Stores",
    storeLocation: "Mississauga Central",
    month: "2026-03",
    cycleStatus: "STATEMENT_READY",
    createdAt: "Mar 1, 2026 08:00 AM",
    updatedAt: "Apr 3, 2026 02:16 PM",
    reconciliationStartedAt: "Apr 2, 2026 08:42 AM",
    reconciliationCompletedAt: "Apr 2, 2026 12:27 PM",
    uploads: {
      lp: {
        status: "UPLOADED",
        fileName: "northstar_lp_mar_2026.xlsx",
        uploadedAt: "Apr 2, 2026 07:54 AM",
        uploadedBy: "Avery Chen",
        totalRows: 398,
        validRows: 398,
        invalidRows: 0,
      },
      store: {
        status: "UPLOADED",
        fileName: "summit_mississauga_mar_2026.xlsx",
        uploadedAt: "Apr 2, 2026 08:19 AM",
        uploadedBy: "Nina Flores",
        totalRows: 398,
        validRows: 398,
        invalidRows: 0,
      },
    },
    timeline: [
      {
        id: "cycle-created",
        title: "Cycle opened",
        description: "March reconciliation cycle was scheduled and activated.",
        timestamp: "Mar 1, 2026 08:00 AM",
        tone: "completed",
      },
      {
        id: "lp-upload",
        title: "LP upload received",
        description: "LP workbook cleared validation with no rejected rows.",
        timestamp: "Apr 2, 2026 07:54 AM",
        tone: "completed",
      },
      {
        id: "store-upload",
        title: "Store upload received",
        description: "Store workbook passed validation and matched source format.",
        timestamp: "Apr 2, 2026 08:19 AM",
        tone: "completed",
      },
      {
        id: "reconciliation",
        title: "Reconciliation passed",
        description: "Both sides matched cleanly with no unresolved mismatches.",
        timestamp: "Apr 2, 2026 12:27 PM",
        tone: "completed",
      },
      {
        id: "statement",
        title: "Statement generated",
        description: "The statement is available for review and downstream export.",
        timestamp: "Apr 3, 2026 02:16 PM",
        tone: "completed",
      },
    ],
    mismatches: {
      total: 0,
      unresolved: 0,
      resolved: 0,
      duplicates: 0,
      missingCounterparts: 0,
      fieldDifferences: 0,
      barcodeIssues: 0,
      pricingIssues: 0,
      lastReviewedAt: "Apr 2, 2026 12:27 PM",
    },
    statement: {
      status: "READY",
      statementId: "stmt_mar_mississauga_2026_03",
      generatedAt: "Apr 3, 2026 02:16 PM",
      lastAttemptAt: "Apr 3, 2026 02:16 PM",
      reason: "Statement is finalized and ready for review.",
    },
    actions: {
      canReviewMismatches: false,
      canViewStatement: true,
      canReprocess: true,
    },
  },
];

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  const parsedDate = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function getCycleStatusTone(status: CycleStatus) {
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

function getUploadStatusTone(status: UploadState) {
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

function getStatementStatusTone(status: StatementState) {
  if (status === "READY") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "PENDING") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getTimelineTone(tone: TimelineEventTone) {
  if (tone === "completed") {
    return {
      dot: "bg-emerald-300",
      text: "text-emerald-100",
      border: "border-emerald-400/20 bg-emerald-500/8",
    };
  }

  if (tone === "active") {
    return {
      dot: "bg-cyan-300",
      text: "text-cyan-100",
      border: "border-cyan-400/20 bg-cyan-500/8",
    };
  }

  if (tone === "warning") {
    return {
      dot: "bg-amber-300",
      text: "text-amber-100",
      border: "border-amber-400/20 bg-amber-500/8",
    };
  }

  if (tone === "failed") {
    return {
      dot: "bg-red-300",
      text: "text-red-100",
      border: "border-red-400/20 bg-red-500/8",
    };
  }

  return {
    dot: "bg-slate-400",
    text: "text-slate-200",
    border: "border-white/10 bg-white/5",
  };
}

async function getCycleDetailsState(cycleId: string): Promise<CycleDetailsState> {
  const mockMode = process.env.MOCK_LP_CYCLE_DETAILS_STATE;

  if (mockMode === "loading") {
    return { kind: "loading" };
  }

  if (mockMode === "error") {
    return {
      kind: "error",
      message:
        "We could not load this reconciliation cycle right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }

  const cycle = mockCycles.find((entry) => entry.id === cycleId);

  if (!cycle) {
    return {
      kind: "missing",
      cycleId,
    };
  }

  return {
    kind: "ready",
    cycle,
  };
}

function Badge({
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

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm leading-6 text-slate-400">{detail}</div>
    </div>
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

function UploadCard({
  title,
  upload,
}: {
  title: string;
  upload: CycleDetails["uploads"]["lp"] | CycleDetails["uploads"]["store"];
}) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg text-white">{title}</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          Source file acceptance and validation summary for this side of the cycle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DetailRow
          label="Upload status"
          value={
            <Badge
              label={upload.status.replaceAll("_", " ")}
              className={getUploadStatusTone(upload.status)}
            />
          }
        />
        <DetailRow label="File name" value={upload.fileName ?? "Not received"} />
        <DetailRow label="Uploaded at" value={upload.uploadedAt ?? "Pending"} />
        <DetailRow label="Uploaded by" value={upload.uploadedBy ?? "Pending"} />
        <DetailRow
          label="Total rows"
          value={upload.totalRows !== null ? upload.totalRows : "Pending"}
        />
        <DetailRow
          label="Valid rows"
          value={upload.validRows !== null ? upload.validRows : "Pending"}
        />
        <DetailRow
          label="Invalid rows"
          value={upload.invalidRows !== null ? upload.invalidRows : "Pending"}
        />
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        {[0, 1].map((item) => (
          <Card
            key={item}
            className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
          >
            <CardHeader className="space-y-3">
              <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
              <div className="h-9 w-60 animate-pulse rounded bg-white/10" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-12 animate-pulse rounded-xl bg-white/8" />
              <div className="h-12 animate-pulse rounded-xl bg-white/8" />
              <div className="h-12 animate-pulse rounded-xl bg-white/8" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-36 animate-pulse rounded-2xl border border-white/10 bg-white/6"
          />
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-3">
          <div className="h-5 w-52 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-72 animate-pulse rounded bg-white/10" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-2xl bg-white/8"
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Cycle unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Reconciliation cycle could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/cycles">Return to cycles</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function MissingState({ cycleId }: { cycleId: string }) {
  return (
    <Card className="border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-100">
          Cycle not found
        </div>
        <CardTitle className="text-2xl text-white">
          No reconciliation cycle matched this identifier
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-amber-100/90">
          The cycle ID <span className="font-medium text-white">{cycleId}</span>{" "}
          is not available in the current LP context.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/cycles">Return to cycles</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          <Link href="/lp/uploads">View import history</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ReadyState({
  cycle,
}: {
  cycle: CycleDetails;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
              VendorStream
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl text-white">
                {cycle.lpName} · {cycle.storeLocation}
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-300">
                Detailed reconciliation status for {cycle.storeOrganization} in{" "}
                {formatMonthLabel(cycle.month)}.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="LP name" value={`${cycle.lpName} (${cycle.lpCode})`} />
            <DetailRow label="Store organization" value={cycle.storeOrganization} />
            <DetailRow label="Store location" value={cycle.storeLocation} />
            <DetailRow label="Month" value={formatMonthLabel(cycle.month)} />
            <DetailRow
              label="Cycle status"
              value={
                <Badge
                  label={cycle.cycleStatus.replaceAll("_", " ")}
                  className={getCycleStatusTone(cycle.cycleStatus)}
                />
              }
            />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">Timestamps</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Operational checkpoints recorded for this cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Created at" value={cycle.createdAt} />
            <DetailRow label="Last updated" value={cycle.updatedAt} />
            <DetailRow
              label="Reconciliation started"
              value={cycle.reconciliationStartedAt ?? "Not started"}
            />
            <DetailRow
              label="Reconciliation completed"
              value={cycle.reconciliationCompletedAt ?? "Not completed"}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <SummaryMetric
          label="Open mismatches"
          value={String(cycle.mismatches.unresolved)}
          detail="Outstanding issues still blocking clean reconciliation."
        />
        <SummaryMetric
          label="Resolved mismatches"
          value={String(cycle.mismatches.resolved)}
          detail="Issues already reviewed and marked complete."
        />
        <SummaryMetric
          label="LP valid rows"
          value={String(cycle.uploads.lp.validRows ?? 0)}
          detail="Validated LP rows accepted from the uploaded workbook."
        />
        <SummaryMetric
          label="Statement status"
          value={cycle.statement.status.replaceAll("_", " ")}
          detail={cycle.statement.reason}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <UploadCard title="LP upload status summary" upload={cycle.uploads.lp} />
        <UploadCard
          title="Store upload status summary"
          upload={cycle.uploads.store}
        />
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">Processing timeline</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            End-to-end operational milestones for the current reconciliation cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cycle.timeline.map((event) => {
            const styles = getTimelineTone(event.tone);

            return (
              <div
                key={event.id}
                className={`flex gap-4 rounded-2xl border px-4 py-4 ${styles.border}`}
              >
                <div className="mt-1 flex-shrink-0">
                  <div className={`h-3 w-3 rounded-full ${styles.dot}`} />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className={`text-sm font-medium ${styles.text}`}>
                    {event.title}
                  </div>
                  <div className="text-sm leading-6 text-slate-300">
                    {event.description}
                  </div>
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    {event.timestamp ?? "Pending timestamp"}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">Mismatch summary</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Breakdown of reconciliation issues detected in the current cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <DetailRow
              label="Total mismatches"
              value={cycle.mismatches.total}
            />
            <DetailRow
              label="Unresolved"
              value={cycle.mismatches.unresolved}
            />
            <DetailRow label="Resolved" value={cycle.mismatches.resolved} />
            <DetailRow label="Duplicates" value={cycle.mismatches.duplicates} />
            <DetailRow
              label="Missing counterparts"
              value={cycle.mismatches.missingCounterparts}
            />
            <DetailRow
              label="Field differences"
              value={cycle.mismatches.fieldDifferences}
            />
            <DetailRow
              label="Barcode issues"
              value={cycle.mismatches.barcodeIssues}
            />
            <DetailRow
              label="Pricing issues"
              value={cycle.mismatches.pricingIssues}
            />
            <DetailRow
              label="Last reviewed"
              value={cycle.mismatches.lastReviewedAt ?? "Not reviewed"}
            />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">Statement summary</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Automatic statement generation status for this LP and store month.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Statement status"
              value={
                <Badge
                  label={cycle.statement.status.replaceAll("_", " ")}
                  className={getStatementStatusTone(cycle.statement.status)}
                />
              }
            />
            <DetailRow
              label="Statement ID"
              value={cycle.statement.statementId ?? "Not generated"}
            />
            <DetailRow
              label="Generated at"
              value={cycle.statement.generatedAt ?? "Pending"}
            />
            <DetailRow
              label="Last generation attempt"
              value={cycle.statement.lastAttemptAt ?? "No attempt yet"}
            />
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              <div className="text-sm text-slate-400">Status detail</div>
              <div className="mt-1 text-sm leading-6 text-white">
                {cycle.statement.reason}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">Actions</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Operational shortcuts for the current cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            asChild={cycle.actions.canReviewMismatches}
            disabled={!cycle.actions.canReviewMismatches}
            className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/10 disabled:text-slate-500"
          >
            {cycle.actions.canReviewMismatches ? (
              <Link href={`/lp/cycles/${cycle.id}/mismatches`}>
                Review mismatches
              </Link>
            ) : (
              <span>Review mismatches</span>
            )}
          </Button>

          <Button
            asChild={cycle.actions.canViewStatement}
            variant="outline"
            disabled={!cycle.actions.canViewStatement}
            className="border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
          >
            {cycle.actions.canViewStatement ? (
              <Link href={`/lp/statements?cycleId=${cycle.id}`}>View statement</Link>
            ) : (
              <span>View statement</span>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            disabled={!cycle.actions.canReprocess}
            className="text-slate-300 hover:bg-white/5 hover:text-white disabled:text-slate-500"
          >
            Reprocess
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function LpCycleDetailsPage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = await params;
  const state = await getCycleDetailsState(cycleId);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06111f] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(27,55,95,0.55),transparent_42%)]" />
        <div className="absolute left-[-10%] top-[18%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute right-[-8%] top-[12%] h-[28rem] w-[28rem] rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,17,31,0.72)_0%,rgba(6,17,31,0.96)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            LP Cycle Details
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Reconciliation cycle operations view
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Inspect one monthly LP and store reconciliation cycle, including
              upload readiness, processing milestones, mismatch workload, and
              statement generation status.
            </p>
          </div>
        </header>

        {state.kind === "loading" ? <LoadingState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "missing" ? <MissingState cycleId={state.cycleId} /> : null}
        {state.kind === "ready" ? <ReadyState cycle={state.cycle} /> : null}
      </div>
    </main>
  );
}
