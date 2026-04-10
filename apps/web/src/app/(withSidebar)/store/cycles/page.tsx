import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type CycleStatus,
  type ImportBatchStatus,
  type StatementStatus,
  type StatementTaskStatus,
} from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
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

type SummaryItem = {
  label:
    | "Total Cycles"
    | "Awaiting Store Upload"
    | "Cycles With Open Mismatches"
    | "Statement Ready";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type CycleRow = {
  id: string;
  month: Date;
  lpId: string;
  lpName: string;
  storeOrganizationName: string;
  storeLocationId: string;
  storeLocationName: string;
  cycleStatus: CycleStatus;
  lpUploadStatus: UploadState;
  storeUploadStatus: UploadState;
  mismatchCount: number;
  statementStatus: StatementState;
  latestStatementId: string | null;
  latestStatementVersion: number | null;
  latestStatementGeneratedAt: Date | null;
  latestStatementTaskStatus: StatementTaskStatus | null;
  lpBatchId: string | null;
  storeBatchId: string | null;
  lastError: string | null;
};

type CycleFilters = {
  month: string;
  status: string;
  storeLocation: string;
  lp: string;
  cycleId: string;
};

type StoreCyclesPageState =
  | {
      kind: "ready";
      context: {
        primaryStoreOrganizationName: string;
        totalStoreOrganizations: number;
        totalLocations: number;
        isFallbackContext: boolean;
      };
      summary: SummaryItem[];
      filters: CycleFilters;
      lpOptions: Array<{
        id: string;
        name: string;
      }>;
      locationOptions: Array<{
        id: string;
        name: string;
      }>;
      rows: CycleRow[];
      selectedCycle: CycleRow | null;
    }
  | {
      kind: "empty";
      context:
        | {
            primaryStoreOrganizationName: string;
            totalStoreOrganizations: number;
            totalLocations: number;
            isFallbackContext: boolean;
          }
        | null;
      filters: CycleFilters;
      lpOptions: Array<{
        id: string;
        name: string;
      }>;
      locationOptions: Array<{
        id: string;
        name: string;
      }>;
      isAccessEmpty: boolean;
    }
  | {
      kind: "error";
      message: string;
    };

const CYCLE_STATUS_OPTIONS: CycleStatus[] = [
  "AWAITING_UPLOADS",
  "PROCESSING",
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
  "MISMATCHES_FOUND",
  "RECONCILIATION_PASSED",
  "STATEMENT_PENDING",
  "STATEMENT_GENERATING",
  "STATEMENT_READY",
  "FAILED",
];

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
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
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

function formatMonthParam(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function formatCycleStatus(status: CycleStatus) {
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

function SummaryCard({ item }: { item: SummaryItem }) {
  const accentClass =
    item.tone === "success"
      ? "from-emerald-400/20 to-transparent"
      : item.tone === "warning"
        ? "from-amber-400/20 to-transparent"
        : "from-cyan-400/20 to-transparent";

  return (
    <Card className="relative border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${accentClass}`}
      />
      <CardHeader className="relative space-y-2">
        <CardDescription className="text-xs uppercase tracking-[0.18em] text-slate-300">
          {item.label}
        </CardDescription>
        <CardTitle className="text-4xl font-semibold tracking-tight text-white">
          {item.value}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <p className="text-sm leading-6 text-slate-300">{item.detail}</p>
      </CardContent>
    </Card>
  );
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

function parseMonthFilter(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map((part) => Number(part));
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { start, end };
}

function isCycleStatus(value: string): value is CycleStatus {
  return CYCLE_STATUS_OPTIONS.includes(value as CycleStatus);
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

function buildStoreUploadHref(row: Pick<CycleRow, "lpId" | "storeLocationId" | "month">) {
  const params = new URLSearchParams({
    lpId: row.lpId,
    storeLocationId: row.storeLocationId,
    month: formatMonthParam(row.month),
  });

  return `/store/uploads/new?${params.toString()}`;
}

function FilterBar({
  filters,
  lpOptions,
  locationOptions,
}: {
  filters: CycleFilters;
  lpOptions: Array<{
    id: string;
    name: string;
  }>;
  locationOptions: Array<{
    id: string;
    name: string;
  }>;
}) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg text-white">Filters</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          Narrow cycle rows by reporting month, cycle status, store location, or LP.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 xl:grid-cols-[0.8fr_1fr_1fr_1fr_auto]">
          <div className="space-y-2">
            <label htmlFor="month" className="text-sm font-medium text-slate-200">
              Month
            </label>
            <input
              id="month"
              name="month"
              type="month"
              defaultValue={filters.month}
              className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="status" className="text-sm font-medium text-slate-200">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={filters.status}
              className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
            >
              <option value="" className="bg-slate-950 text-white">
                All statuses
              </option>
              {CYCLE_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status} className="bg-slate-950 text-white">
                  {formatCycleStatus(status)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="storeLocation"
              className="text-sm font-medium text-slate-200"
            >
              Store location
            </label>
            <select
              id="storeLocation"
              name="storeLocation"
              defaultValue={filters.storeLocation}
              className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
            >
              <option value="" className="bg-slate-950 text-white">
                All store locations
              </option>
              {locationOptions.map((location) => (
                <option key={location.id} value={location.id} className="bg-slate-950 text-white">
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="lp" className="text-sm font-medium text-slate-200">
              LP
            </label>
            <select
              id="lp"
              name="lp"
              defaultValue={filters.lp}
              className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
            >
              <option value="" className="bg-slate-950 text-white">
                All LPs
              </option>
              {lpOptions.map((lp) => (
                <option key={lp.id} value={lp.id} className="bg-slate-950 text-white">
                  {lp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-3">
            <Button type="submit" className="bg-white text-slate-950 hover:bg-slate-100">
              Apply filters
            </Button>
            <Button
              asChild
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href="/store/cycles">Reset</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

async function getStoreCyclesPageState(searchParams?: {
  month?: string;
  status?: string;
  storeLocation?: string;
  lp?: string;
  cycleId?: string;
}): Promise<StoreCyclesPageState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    redirect("/login");
  }

  const filters: CycleFilters = {
    month: searchParams?.month?.trim() ?? "",
    status: searchParams?.status?.trim() ?? "",
    storeLocation: searchParams?.storeLocation?.trim() ?? "",
    lp: searchParams?.lp?.trim() ?? "",
    cycleId: searchParams?.cycleId?.trim() ?? "",
  };

  try {
    const context = await getStoreUploadContextForUser({
      userId: session.user.id,
      systemRole: session.user.systemRole,
    });

    if (context.options.length === 0) {
      return {
        kind: "empty",
        context: null,
        filters,
        lpOptions: [],
        locationOptions: [],
        isAccessEmpty: true,
      };
    }

    const lpOptions = Array.from(
      new Map(
        context.options.map((option) => [
          option.lpId,
          {
            id: option.lpId,
            name: option.lpName,
          },
        ]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));

    const locationOptions = Array.from(
      new Map(
        context.options.map((option) => [
          option.storeLocationId,
          {
            id: option.storeLocationId,
            name: option.storeLocationName,
          },
        ]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));

    const scopedPairs = Array.from(
      new Map(
        context.options.map((option) => [
          `${option.lpId}:${option.storeLocationId}`,
          {
            lpId: option.lpId,
            storeLocationId: option.storeLocationId,
          },
        ]),
      ).values(),
    );

    const filteredPairs = scopedPairs.filter((pair) => {
      const lpMatch = !filters.lp || pair.lpId === filters.lp;
      const storeLocationMatch =
        !filters.storeLocation || pair.storeLocationId === filters.storeLocation;

      return lpMatch && storeLocationMatch;
    });

    if (filteredPairs.length === 0) {
      return {
        kind: "empty",
        context: {
          primaryStoreOrganizationName:
            context.primaryStoreOrganizationName ?? "Store Organization",
          totalStoreOrganizations: context.totalStoreOrganizations,
          totalLocations: context.totalLocations,
          isFallbackContext: context.isFallbackContext,
        },
        filters,
        lpOptions,
        locationOptions,
        isAccessEmpty: false,
      };
    }

    const monthRange = parseMonthFilter(filters.month);
    const cycleStatusFilter = isCycleStatus(filters.status)
      ? filters.status
      : undefined;

    const fullScopeWhere = {
      OR: scopedPairs.map((pair) => ({
        lpId: pair.lpId,
        storeLocationId: pair.storeLocationId,
      })),
    };

    const filteredWhere = {
      OR: filteredPairs.map((pair) => ({
        lpId: pair.lpId,
        storeLocationId: pair.storeLocationId,
      })),
      ...(monthRange
        ? {
            periodMonth: {
              gte: monthRange.start,
              lt: monthRange.end,
            },
          }
        : {}),
      ...(cycleStatusFilter ? { status: cycleStatusFilter } : {}),
    };

    const [summaryCounts, cycles] = await Promise.all([
      Promise.all([
        prisma.reconciliationCycle.count({
          where: fullScopeWhere,
        }),
        prisma.reconciliationCycle.count({
          where: {
            ...fullScopeWhere,
            importBatches: {
              none: {
                sourceType: "STORE",
                isCurrent: true,
              },
            },
          },
        }),
        prisma.reconciliationCycle.count({
          where: {
            ...fullScopeWhere,
            mismatches: {
              some: {
                status: "OPEN",
              },
            },
          },
        }),
        prisma.reconciliationCycle.count({
          where: {
            ...fullScopeWhere,
            statements: {
              some: {
                status: "FINAL",
              },
            },
          },
        }),
      ]),
      prisma.reconciliationCycle.findMany({
        where: filteredWhere,
        orderBy: [{ periodMonth: "desc" }, { updatedAt: "desc" }],
        take: 40,
        select: {
          id: true,
          lpId: true,
          storeLocationId: true,
          periodMonth: true,
          status: true,
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
            where: {
              isCurrent: true,
            },
            orderBy: [{ createdAt: "desc" }],
            select: {
              id: true,
              sourceType: true,
              status: true,
            },
          },
          mismatches: {
            where: {
              status: "OPEN",
            },
            select: {
              id: true,
            },
          },
          statementTasks: {
            orderBy: [{ createdAt: "desc" }],
            take: 1,
            select: {
              status: true,
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
      }),
    ]);

    const rows: CycleRow[] = cycles.map((cycle) => {
      const lpBatch = cycle.importBatches.find((batch) => batch.sourceType === "LP");
      const storeBatch = cycle.importBatches.find(
        (batch) => batch.sourceType === "STORE",
      );
      const latestStatement = cycle.statements[0];
      const latestStatementTask = cycle.statementTasks[0];

      return {
        id: cycle.id,
        month: cycle.periodMonth,
        lpId: cycle.lpId,
        lpName: cycle.lp.name,
        storeOrganizationName: cycle.storeLocation.storeOrganization.name,
        storeLocationId: cycle.storeLocationId,
        storeLocationName: cycle.storeLocation.name,
        cycleStatus: cycle.status,
        lpUploadStatus: deriveUploadState(lpBatch?.status),
        storeUploadStatus: deriveUploadState(storeBatch?.status),
        mismatchCount: cycle.mismatches.length,
        statementStatus: deriveStatementState({
          cycleStatus: cycle.status,
          statementStatus: latestStatement?.status,
          statementTaskStatus: latestStatementTask?.status,
        }),
        latestStatementId: latestStatement?.id ?? null,
        latestStatementVersion: latestStatement?.version ?? null,
        latestStatementGeneratedAt: latestStatement?.generatedAt ?? null,
        latestStatementTaskStatus: latestStatementTask?.status ?? null,
        lpBatchId: lpBatch?.id ?? null,
        storeBatchId: storeBatch?.id ?? null,
        lastError: cycle.lastError,
      };
    });

    if (rows.length === 0) {
      return {
        kind: "empty",
        context: {
          primaryStoreOrganizationName:
            context.primaryStoreOrganizationName ?? "Store Organization",
          totalStoreOrganizations: context.totalStoreOrganizations,
          totalLocations: context.totalLocations,
          isFallbackContext: context.isFallbackContext,
        },
        filters,
        lpOptions,
        locationOptions,
        isAccessEmpty: false,
      };
    }

    const selectedCycle =
      rows.find((row) => row.id === filters.cycleId) ?? rows[0] ?? null;

    return {
      kind: "ready",
      context: {
        primaryStoreOrganizationName:
          context.primaryStoreOrganizationName ?? "Store Organization",
        totalStoreOrganizations: context.totalStoreOrganizations,
        totalLocations: context.totalLocations,
        isFallbackContext: context.isFallbackContext,
      },
      summary: [
        {
          label: "Total Cycles",
          value: String(summaryCounts[0]),
          detail:
            "Reconciliation cycles currently visible across your store access scope.",
          tone: "neutral",
        },
        {
          label: "Awaiting Store Upload",
          value: String(summaryCounts[1]),
          detail:
            "Cycles that still need the current store-side monthly source file.",
          tone: "warning",
        },
        {
          label: "Cycles With Open Mismatches",
          value: String(summaryCounts[2]),
          detail:
            "Cycles with unresolved mismatch work that still requires store review.",
          tone: "warning",
        },
        {
          label: "Statement Ready",
          value: String(summaryCounts[3]),
          detail:
            "Cycles that already have a finalized statement available.",
          tone: "success",
        },
      ],
      filters,
      lpOptions,
      locationOptions,
      rows,
      selectedCycle,
    };
  } catch (error) {
    console.error("Failed to load store cycles page", error);

    return {
      kind: "error",
      message:
        "We could not load store reconciliation cycles right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function EmptyState({
  context,
  filters,
  lpOptions,
  locationOptions,
  isAccessEmpty,
}: Extract<StoreCyclesPageState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.month || filters.status || filters.storeLocation || filters.lp,
  );

  return (
    <div className="space-y-6">
      {!isAccessEmpty ? (
        <FilterBar
          filters={filters}
          lpOptions={lpOptions}
          locationOptions={locationOptions}
        />
      ) : null}

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            {isAccessEmpty
              ? "No store cycle access found"
              : "No reconciliation cycles found"}
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {isAccessEmpty
              ? "Your current account does not yet have any active store-side LP assignments."
              : hasFilters
                ? "No reconciliation cycles match the current filters."
                : `No reconciliation cycles have been created yet for ${context?.primaryStoreOrganizationName ?? "this store organization"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href="/store/uploads/new">Upload store monthly file</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link href="/store/dashboard">Back to store dashboard</Link>
          </Button>
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
          Cycles unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Store reconciliation cycles could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/store/dashboard">Back to store dashboard</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          <Link href="/store/uploads/new">Upload store monthly file</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function StoreCyclesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    status?: string;
    storeLocation?: string;
    lp?: string;
    cycleId?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const state = await getStoreCyclesPageState(resolvedSearchParams);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            Store Reconciliation
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Store cycles
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review reconciliation cycles across the store locations your account
              can access, including upload readiness, mismatch pressure, and
              statement progress.
            </p>
          </div>
        </header>

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}

        {state.kind === "empty" ? (
          <EmptyState {...state} />
        ) : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Viewing cycles for{" "}
              <span className="font-medium text-white">
                {state.context.primaryStoreOrganizationName}
              </span>
              {state.context.totalStoreOrganizations > 1
                ? ` and ${state.context.totalStoreOrganizations - 1} more store organizations`
                : ""}
              . {state.context.totalLocations} active store
              {state.context.totalLocations === 1 ? " location" : " locations"} are
              included in this scope.
              {state.context.isFallbackContext
                ? " TODO: replace admin fallback scoping with explicit store organization switching."
                : ""}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {state.summary.map((item) => (
                <SummaryCard key={item.label} item={item} />
              ))}
            </div>

            <FilterBar
              filters={state.filters}
              lpOptions={state.lpOptions}
              locationOptions={state.locationOptions}
            />

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Reconciliation cycles
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real `ReconciliationCycle` records scoped to your current store
                  organization access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.rows.map((row) => (
                  <div
                    key={row.id}
                    className={`rounded-2xl border px-4 py-4 ${
                      row.id === state.selectedCycle?.id
                        ? "border-cyan-400/30 bg-cyan-400/10"
                        : "border-white/8 bg-slate-950/35"
                    }`}
                  >
                    <div className="grid gap-4 xl:grid-cols-[0.75fr_1fr_1fr_1fr_0.85fr_0.85fr_0.85fr_0.7fr_0.8fr_auto] xl:items-start">
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Month
                        </div>
                        <div className="text-sm font-medium text-white">
                          {formatMonth(row.month)}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          LP
                        </div>
                        <div className="text-sm text-slate-300">{row.lpName}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Store organization
                        </div>
                        <div className="text-sm text-slate-300">
                          {row.storeOrganizationName}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Store location
                        </div>
                        <div className="text-sm text-slate-300">
                          {row.storeLocationName}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Cycle status
                        </div>
                        <StatusBadge
                          label={formatCycleStatus(row.cycleStatus)}
                          className={getCycleTone(row.cycleStatus)}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          LP upload
                        </div>
                        <StatusBadge
                          label={formatUploadState(row.lpUploadStatus)}
                          className={getUploadTone(row.lpUploadStatus)}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Store upload
                        </div>
                        <StatusBadge
                          label={formatUploadState(row.storeUploadStatus)}
                          className={getUploadTone(row.storeUploadStatus)}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Mismatches
                        </div>
                        <div className="text-sm text-slate-300">
                          {row.mismatchCount}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Statement
                        </div>
                        <StatusBadge
                          label={formatStatementState(row.statementStatus)}
                          className={getStatementTone(row.statementStatus)}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                        >
                          <Link
                            href={`/store/cycles/${row.id}`}
                          >
                            View cycle details
                          </Link>
                        </Button>

                        {row.mismatchCount > 0 ? (
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="text-slate-300 hover:bg-white/5 hover:text-white"
                          >
                            <Link
                              href={`/store/cycles/${row.id}/mismatches`}
                            >
                              Review mismatches
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled
                            className="text-slate-300 disabled:text-slate-500"
                          >
                            Review mismatches
                          </Button>
                        )}

                        {row.latestStatementId ? (
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="text-slate-300 hover:bg-white/5 hover:text-white"
                          >
                            <Link href={`/store/statements/${row.latestStatementId}`}>
                              View statement
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled
                            className="text-slate-300 disabled:text-slate-500"
                          >
                            View statement
                          </Button>
                        )}

                        {row.storeUploadStatus === "NOT_UPLOADED" ? (
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="text-slate-300 hover:bg-white/5 hover:text-white"
                          >
                            <Link href={buildStoreUploadHref(row)}>
                              Upload missing file
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled
                            className="text-slate-300 disabled:text-slate-500"
                          >
                            Upload missing file
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {state.selectedCycle ? (
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Selected cycle details
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Focused cycle context for the selected row while dedicated
                    store cycle detail routes are still being built.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  <DetailRow label="Cycle ID" value={state.selectedCycle.id} />
                  <DetailRow
                    label="Month"
                    value={formatMonth(state.selectedCycle.month)}
                  />
                  <DetailRow
                    label="LP"
                    value={state.selectedCycle.lpName}
                  />
                  <DetailRow
                    label="Store organization"
                    value={state.selectedCycle.storeOrganizationName}
                  />
                  <DetailRow
                    label="Store location"
                    value={state.selectedCycle.storeLocationName}
                  />
                  <DetailRow
                    label="Cycle status"
                    value={
                      <StatusBadge
                        label={formatCycleStatus(state.selectedCycle.cycleStatus)}
                        className={getCycleTone(state.selectedCycle.cycleStatus)}
                      />
                    }
                  />
                  <DetailRow
                    label="LP upload status"
                    value={
                      <StatusBadge
                        label={formatUploadState(state.selectedCycle.lpUploadStatus)}
                        className={getUploadTone(state.selectedCycle.lpUploadStatus)}
                      />
                    }
                  />
                  <DetailRow
                    label="Store upload status"
                    value={
                      <StatusBadge
                        label={formatUploadState(state.selectedCycle.storeUploadStatus)}
                        className={getUploadTone(state.selectedCycle.storeUploadStatus)}
                      />
                    }
                  />
                  <DetailRow
                    label="Open mismatch count"
                    value={state.selectedCycle.mismatchCount}
                  />
                  <DetailRow
                    label="Statement status"
                    value={
                      <StatusBadge
                        label={formatStatementState(
                          state.selectedCycle.statementStatus,
                        )}
                        className={getStatementTone(
                          state.selectedCycle.statementStatus,
                        )}
                      />
                    }
                  />
                  <DetailRow
                    label="Latest statement version"
                    value={
                      state.selectedCycle.latestStatementVersion
                        ? `v${state.selectedCycle.latestStatementVersion}`
                        : "Not available"
                    }
                  />
                  <DetailRow
                    label="Statement generated at"
                    value={formatDateTime(
                      state.selectedCycle.latestStatementGeneratedAt,
                    )}
                  />
                  <DetailRow
                    label="Latest statement task"
                    value={formatStatementTaskStatus(
                      state.selectedCycle.latestStatementTaskStatus,
                    )}
                  />
                  <DetailRow
                    label="Current LP batch"
                    value={state.selectedCycle.lpBatchId ?? "Not available"}
                  />
                  <DetailRow
                    label="Current store batch"
                    value={state.selectedCycle.storeBatchId ?? "Not available"}
                  />
                  <DetailRow
                    label="Last cycle error"
                    value={state.selectedCycle.lastError ?? "Not available"}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
