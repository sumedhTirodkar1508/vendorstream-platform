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

type CycleRow = {
  id: string;
  month: string;
  storeOrganization: string;
  storeLocation: string;
  cycleStatus: CycleStatus;
  lpUploadStatus: UploadState;
  storeUploadStatus: UploadState;
  mismatchCount: number;
  statementStatus: StatementState;
};

type CyclesState =
  | {
      kind: "ready";
      lpName: string;
      filters: {
        month: string;
        status: string;
        storeLocation: string;
      };
      rows: CycleRow[];
      availableStoreLocations: string[];
    }
  | {
      kind: "empty";
      lpName: string;
      filters: {
        month: string;
        status: string;
        storeLocation: string;
      };
      availableStoreLocations: string[];
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "loading";
    };

const mockRows: CycleRow[] = [
  {
    id: "cycle_apr_downtown",
    month: "2026-04",
    storeOrganization: "Maple Retail Group",
    storeLocation: "Toronto Downtown",
    cycleStatus: "MISMATCHES_FOUND",
    lpUploadStatus: "UPLOADED",
    storeUploadStatus: "UPLOADED",
    mismatchCount: 6,
    statementStatus: "PENDING",
  },
  {
    id: "cycle_apr_waterfront",
    month: "2026-04",
    storeOrganization: "Maple Retail Group",
    storeLocation: "Toronto Waterfront",
    cycleStatus: "READY_FOR_RECONCILIATION",
    lpUploadStatus: "UPLOADED",
    storeUploadStatus: "VALIDATING",
    mismatchCount: 0,
    statementStatus: "NOT_READY",
  },
  {
    id: "cycle_mar_mississauga",
    month: "2026-03",
    storeOrganization: "Summit Stores",
    storeLocation: "Mississauga Central",
    cycleStatus: "STATEMENT_READY",
    lpUploadStatus: "UPLOADED",
    storeUploadStatus: "UPLOADED",
    mismatchCount: 0,
    statementStatus: "READY",
  },
  {
    id: "cycle_feb_northyork",
    month: "2026-02",
    storeOrganization: "Summit Stores",
    storeLocation: "North York East",
    cycleStatus: "RECONCILING",
    lpUploadStatus: "UPLOADED",
    storeUploadStatus: "UPLOADED",
    mismatchCount: 2,
    statementStatus: "GENERATING",
  },
  {
    id: "cycle_jan_brampton",
    month: "2026-01",
    storeOrganization: "Metro Beverage Partners",
    storeLocation: "Brampton West",
    cycleStatus: "AWAITING_UPLOADS",
    lpUploadStatus: "NOT_UPLOADED",
    storeUploadStatus: "UPLOADED",
    mismatchCount: 0,
    statementStatus: "NOT_READY",
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

async function getLpCyclesState(searchParams?: {
  month?: string;
  status?: string;
  storeLocation?: string;
}): Promise<CyclesState> {
  const mockMode = process.env.MOCK_LP_CYCLES_STATE;
  const monthFilter = searchParams?.month?.trim() ?? "";
  const statusFilter = searchParams?.status?.trim() ?? "";
  const storeLocationFilter = searchParams?.storeLocation?.trim() ?? "";

  if (mockMode === "loading") {
    return { kind: "loading" };
  }

  if (mockMode === "error") {
    return {
      kind: "error",
      message:
        "We could not load reconciliation cycles right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }

  const availableStoreLocations = Array.from(
    new Set(mockRows.map((row) => row.storeLocation)),
  ).sort();

  const filteredRows = mockRows.filter((row) => {
    const monthMatch = !monthFilter || row.month === monthFilter;
    const statusMatch = !statusFilter || row.cycleStatus === statusFilter;
    const storeLocationMatch =
      !storeLocationFilter || row.storeLocation === storeLocationFilter;

    return monthMatch && statusMatch && storeLocationMatch;
  });

  if (mockMode === "empty" || filteredRows.length === 0) {
    return {
      kind: "empty",
      lpName: "Northstar Beverage Group",
      filters: {
        month: monthFilter,
        status: statusFilter,
        storeLocation: storeLocationFilter,
      },
      availableStoreLocations,
    };
  }

  return {
    kind: "ready",
    lpName: "Northstar Beverage Group",
    filters: {
      month: monthFilter,
      status: statusFilter,
      storeLocation: storeLocationFilter,
    },
    rows: filteredRows,
    availableStoreLocations,
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

function FilterForm({
  filters,
  storeLocations,
}: {
  filters: {
    month: string;
    status: string;
    storeLocation: string;
  };
  storeLocations: string[];
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
              {[
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
              ].map((status) => (
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
                  key={storeLocation}
                  value={storeLocation}
                  className="bg-slate-950 text-white"
                >
                  {storeLocation}
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

function LoadingState() {
  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-3">
          <div className="h-6 w-32 animate-pulse rounded bg-white/10" />
          <div className="h-10 animate-pulse rounded-xl bg-white/8" />
        </CardHeader>
      </Card>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-3">
          <div className="h-5 w-52 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-72 animate-pulse rounded bg-white/10" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-2xl bg-white/8"
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
        <Button
          asChild
          className="bg-white text-slate-950 hover:bg-slate-100"
        >
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
}: {
  lpName: string;
  filters: {
    month: string;
    status: string;
    storeLocation: string;
  };
  storeLocations: string[];
}) {
  const hasFilters = Boolean(
    filters.month || filters.status || filters.storeLocation,
  );

  return (
    <div className="space-y-6">
      <FilterForm filters={filters} storeLocations={storeLocations} />

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No reconciliation cycles found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No cycle rows match the current filters."
              : `There are no reconciliation cycles yet for ${lpName}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
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
        </CardContent>
      </Card>
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
                  <Badge
                    label={row.cycleStatus.replaceAll("_", " ")}
                    className={getCycleStatusTone(row.cycleStatus)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    LP upload
                  </div>
                  <Badge
                    label={row.lpUploadStatus.replaceAll("_", " ")}
                    className={getUploadStatusTone(row.lpUploadStatus)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Store upload
                  </div>
                  <Badge
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
                  <Badge
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

        {state.kind === "loading" ? <LoadingState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? (
          <EmptyState
            lpName={state.lpName}
            filters={state.filters}
            storeLocations={state.availableStoreLocations}
          />
        ) : null}
        {state.kind === "ready" ? <ReadyState state={state} /> : null}
      </div>
    </main>
  );
}
