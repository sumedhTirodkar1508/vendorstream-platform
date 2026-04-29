import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type CycleStatus,
  type ImportBatchStatus,
  type StatementStatus,
} from "@vendorstream/database";
import { RefreshCw } from "lucide-react";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { EmptyState as AppEmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { getLpAccessContextForUser } from "@/lib/lp-access-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMonthLabel } from "@/lib/formatting";

type UploadState = "NOT_UPLOADED" | "UPLOADED" | "VALIDATING" | "FAILED";
type StatementState = "NOT_READY" | "PENDING" | "GENERATING" | "READY" | "FAILED";

type CycleRow = {
  id: string;
  month: Date;
  storeOrganization: string;
  storeLocationId: string;
  storeLocation: string;
  cycleStatus: CycleStatus;
  lpUploadStatus: UploadState;
  storeUploadStatus: UploadState;
  mismatchCount: number;
  statementStatus: StatementState;
};

type CycleFilters = {
  month: string;
  status: string;
  storeLocation: string;
};

type CyclesState =
  | {
      kind: "ready";
      lpName: string;
      filters: CycleFilters;
      rows: CycleRow[];
      availableStoreLocations: Array<{
        id: string;
        label: string;
      }>;
      isAdminPreview: boolean;
    }
  | {
      kind: "empty";
      lpName: string;
      filters: CycleFilters;
      availableStoreLocations: Array<{
        id: string;
        label: string;
      }>;
      isAdminPreview: boolean;
      isAccessEmpty: boolean;
    }
  | {
      kind: "error";
      message: string;
    };

const STATUS_OPTIONS: CycleStatus[] = [
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

function parseMonthFilter(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map((part) => Number(part));
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { start, end };
}

function mapUploadStatus(status?: ImportBatchStatus): UploadState {
  if (!status) {
    return "NOT_UPLOADED";
  }

  if (
    status === "FAILED" ||
    status === "PREVALIDATION_FAILED" ||
    status === "VALIDATION_FAILED" ||
    status === "CANCELED"
  ) {
    return "FAILED";
  }

  if (status === "RECEIVED" || status === "VALIDATING") {
    return "VALIDATING";
  }

  return "UPLOADED";
}

function mapStatementStatus(args: {
  cycleStatus: CycleStatus;
  latestStatementStatus?: StatementStatus;
}): StatementState {
  if (args.latestStatementStatus === "FINAL" || args.cycleStatus === "STATEMENT_READY") {
    return "READY";
  }

  if (args.latestStatementStatus === "FAILED") {
    return "FAILED";
  }

  if (args.cycleStatus === "STATEMENT_GENERATING") {
    return "GENERATING";
  }

  if (args.latestStatementStatus === "DRAFT" || args.cycleStatus === "STATEMENT_PENDING") {
    return "PENDING";
  }

  return "NOT_READY";
}

async function getLpCyclesState(searchParams?: {
  month?: string;
  status?: string;
  storeLocation?: string;
}): Promise<CyclesState> {
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
  };

  try {
    const context = await getLpAccessContextForUser({
      userId: session.user.id,
      systemRole: session.user.systemRole,
    });

    if (context.lpIds.length === 0) {
      return {
        kind: "empty",
        lpName: context.displayName,
        filters,
        availableStoreLocations: [],
        isAdminPreview: false,
        isAccessEmpty: true,
      };
    }

    const monthRange = parseMonthFilter(filters.month);
    const statusFilter = STATUS_OPTIONS.includes(filters.status as CycleStatus)
      ? (filters.status as CycleStatus)
      : undefined;

    const [storeLocations, rows] = await Promise.all([
      prisma.storeLocation.findMany({
        where: {
          lpAssignments: {
            some: {
              lpId: {
                in: context.lpIds,
              },
              isActive: true,
            },
          },
        },
        select: {
          id: true,
          name: true,
          storeOrganization: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ storeOrganization: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.reconciliationCycle.findMany({
        where: {
          lpId: {
            in: context.lpIds,
          },
          ...(filters.storeLocation ? { storeLocationId: filters.storeLocation } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(monthRange
            ? {
                periodMonth: {
                  gte: monthRange.start,
                  lt: monthRange.end,
                },
              }
            : {}),
        },
        orderBy: [{ periodMonth: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          periodMonth: true,
          status: true,
          storeLocation: {
            select: {
              id: true,
              name: true,
              storeOrganization: {
                select: {
                  name: true,
                },
              },
            },
          },
          importBatches: {
            orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
            select: {
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
          statements: {
            orderBy: [{ version: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: {
              status: true,
            },
          },
        },
      }),
    ]);

    const availableStoreLocations = storeLocations.map((location) => ({
      id: location.id,
      label: `${location.name} · ${location.storeOrganization.name}`,
    }));

    if (rows.length === 0) {
      return {
        kind: "empty",
        lpName: context.displayName,
        filters,
        availableStoreLocations,
        isAdminPreview: context.isFallbackContext,
        isAccessEmpty: false,
      };
    }

    return {
      kind: "ready",
      lpName: context.displayName,
      filters,
      availableStoreLocations,
      isAdminPreview: context.isFallbackContext,
      rows: rows.map((row) => {
        const lpBatch = row.importBatches.find((batch) => batch.sourceType === "LP");
        const storeBatch = row.importBatches.find(
          (batch) => batch.sourceType === "STORE",
        );
        const latestStatement = row.statements[0];

        return {
          id: row.id,
          month: row.periodMonth,
          storeOrganization: row.storeLocation.storeOrganization.name,
          storeLocationId: row.storeLocation.id,
          storeLocation: row.storeLocation.name,
          cycleStatus: row.status,
          lpUploadStatus: mapUploadStatus(lpBatch?.status),
          storeUploadStatus: mapUploadStatus(storeBatch?.status),
          mismatchCount: row.mismatches.length,
          statementStatus: mapStatementStatus({
            cycleStatus: row.status,
            latestStatementStatus: latestStatement?.status,
          }),
        };
      }),
    };
  } catch (error) {
    console.error("Failed to load LP cycles", error);

    return {
      kind: "error",
      message:
        "We could not load reconciliation cycles right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function FilterForm({
  filters,
  storeLocations,
}: {
  filters: CycleFilters;
  storeLocations: Array<{
    id: string;
    label: string;
  }>;
}) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg text-white">Filters</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          Narrow cycle rows by reporting month, cycle status, or store location.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 lg:grid-cols-[0.9fr_1fr_1.1fr_auto]">
          <div className="space-y-2">
            <label
              htmlFor="month"
              className="text-sm font-medium text-slate-200"
            >
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
            <label
              htmlFor="status"
              className="text-sm font-medium text-slate-200"
            >
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
              {STATUS_OPTIONS.map((status) => (
                <option
                  key={status}
                  value={status}
                  className="bg-slate-950 text-white"
                >
                  {status.replaceAll("_", " ")}
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
              {storeLocations.map((storeLocation) => (
                <option
                  key={storeLocation.id}
                  value={storeLocation.id}
                  className="bg-slate-950 text-white"
                >
                  {storeLocation.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-3">
            <Button
              type="submit"
              className="bg-white text-slate-950 hover:bg-slate-100"
            >
              Apply filters
            </Button>
            <Button
              asChild
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href="/lp/cycles">Reset</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
          Reconciliation cycles could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/dashboard">Return to dashboard</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          <Link href="/lp/uploads">Open import history</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  lpName,
  filters,
  storeLocations,
  isAdminPreview,
  isAccessEmpty,
}: {
  lpName: string;
  filters: CycleFilters;
  storeLocations: Array<{
    id: string;
    label: string;
  }>;
  isAdminPreview: boolean;
  isAccessEmpty: boolean;
}) {
  const hasFilters = Boolean(
    filters.month || filters.status || filters.storeLocation,
  );

  return (
    <div className="space-y-6">
      <FilterForm filters={filters} storeLocations={storeLocations} />

      {isAdminPreview ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
          Admin preview is showing LP cycle activity across active LP workspaces
          because no explicit LP membership is attached to this user.
        </div>
      ) : null}

      <AppEmptyState
        icon={<RefreshCw className="h-5 w-5" />}
        title="No reconciliation cycles found"
        description={
          isAccessEmpty
            ? "This account is not assigned to any LP workspace yet."
            : hasFilters
              ? "No cycle rows match the current filters."
              : `There are no reconciliation cycles yet for ${lpName}.`
        }
        actions={
          <>
            <Button
              asChild
              className="bg-white text-slate-950 hover:bg-slate-100"
            >
              <Link href="/lp/uploads/new">Upload Monthly File</Link>
            </Button>
            {hasFilters ? (
              <Button
                asChild
                variant="outline"
                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              >
                <Link href="/lp/cycles">Clear filters</Link>
              </Button>
            ) : null}
          </>
        }
      />
    </div>
  );
}

function ReadyState({
  state,
}: {
  state: Extract<CyclesState, { kind: "ready" }>;
}) {
  return (
    <div className="space-y-6">
      <FilterForm
        filters={state.filters}
        storeLocations={state.availableStoreLocations}
      />

      {state.isAdminPreview ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
          Admin preview is showing LP cycle activity across active LP workspaces
          because no explicit LP membership is attached to this user.
        </div>
      ) : null}

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">
            Monthly reconciliation cycles
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            One row per LP, store location, and reporting month for{" "}
            {state.lpName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.rows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
            >
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1fr_1fr_1fr_0.9fr_0.9fr_0.7fr_0.8fr_auto] xl:items-center">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Month
                  </div>
                  <div className="text-sm font-medium text-white">
                    {formatMonthLabel(row.month)}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Store organization
                  </div>
                  <div className="text-sm text-slate-300">
                    {row.storeOrganization}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Store location
                  </div>
                  <div className="text-sm text-slate-300">{row.storeLocation}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Cycle status
                  </div>
                  <StatusBadge
                    label={row.cycleStatus.replaceAll("_", " ")}
                    className={getCycleStatusTone(row.cycleStatus)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    LP upload
                  </div>
                  <StatusBadge
                    label={row.lpUploadStatus.replaceAll("_", " ")}
                    className={getUploadStatusTone(row.lpUploadStatus)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Store upload
                  </div>
                  <StatusBadge
                    label={row.storeUploadStatus.replaceAll("_", " ")}
                    className={getUploadStatusTone(row.storeUploadStatus)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Mismatch count
                  </div>
                  <div className="text-sm text-slate-300">{row.mismatchCount}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Statement status
                  </div>
                  <StatusBadge
                    label={row.statementStatus.replaceAll("_", " ")}
                    className={getStatementStatusTone(row.statementStatus)}
                  />
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Link href={`/lp/cycles/${row.id}`}>View cycle details</Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    <Link href={`/lp/cycles/${row.id}/mismatches`}>
                      Review mismatches
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    <Link href={`/lp/statements?cycleId=${row.id}`}>
                      View statement
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default async function LpCyclesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    status?: string;
    storeLocation?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const state = await getLpCyclesState(resolvedSearchParams);

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
            LP Reconciliation Cycles
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Monthly cycle tracking across store locations
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review cycle-level upload readiness, reconciliation progress,
              mismatch volume, and statement availability for each LP and store
              location month combination.
            </p>
          </div>
        </header>

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? (
          <EmptyState
            lpName={state.lpName}
            filters={state.filters}
            storeLocations={state.availableStoreLocations}
            isAdminPreview={state.isAdminPreview}
            isAccessEmpty={state.isAccessEmpty}
          />
        ) : null}
        {state.kind === "ready" ? <ReadyState state={state} /> : null}
      </div>
    </main>
  );
}
