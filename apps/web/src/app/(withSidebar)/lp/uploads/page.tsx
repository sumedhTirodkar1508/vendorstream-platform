import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ImportBatchStatus =
  | "RECEIVED"
  | "VALIDATING"
  | "VALIDATION_FAILED"
  | "WAITING_FOR_COUNTERPART"
  | "RECONCILING"
  | "RECONCILED"
  | "FAILED";

type ImportHistoryRow = {
  id: string;
  month: string;
  uploadedFileName: string;
  uploadedAt: string;
  uploadedBy: string;
  sourceType: "LP";
  status: ImportBatchStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
};

type ImportHistoryState =
  | {
      kind: "ready";
      lpName: string;
      filters: {
        month: string;
        status: string;
      };
      rows: ImportHistoryRow[];
    }
  | {
      kind: "empty";
      lpName: string;
      filters: {
        month: string;
        status: string;
      };
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "loading";
    };

const mockRows: ImportHistoryRow[] = [
  {
    id: "batch_apr_2026",
    month: "2026-04",
    uploadedFileName: "northstar_lp_apr_2026.xlsx",
    uploadedAt: "Apr 8, 2026 09:14 AM",
    uploadedBy: "Avery Chen",
    sourceType: "LP",
    status: "WAITING_FOR_COUNTERPART",
    totalRows: 412,
    validRows: 405,
    invalidRows: 7,
  },
  {
    id: "batch_mar_2026",
    month: "2026-03",
    uploadedFileName: "northstar_lp_mar_2026.xlsx",
    uploadedAt: "Apr 2, 2026 03:41 PM",
    uploadedBy: "Avery Chen",
    sourceType: "LP",
    status: "RECONCILED",
    totalRows: 398,
    validRows: 398,
    invalidRows: 0,
  },
  {
    id: "batch_feb_2026",
    month: "2026-02",
    uploadedFileName: "northstar_lp_feb_2026_v2.xlsx",
    uploadedAt: "Mar 7, 2026 11:22 AM",
    uploadedBy: "Jordan Patel",
    sourceType: "LP",
    status: "RECONCILING",
    totalRows: 387,
    validRows: 384,
    invalidRows: 3,
  },
  {
    id: "batch_jan_2026",
    month: "2026-01",
    uploadedFileName: "northstar_lp_jan_2026.xlsx",
    uploadedAt: "Feb 4, 2026 08:03 AM",
    uploadedBy: "Jordan Patel",
    sourceType: "LP",
    status: "VALIDATION_FAILED",
    totalRows: 401,
    validRows: 372,
    invalidRows: 29,
  },
];

function getStatusTone(status: ImportBatchStatus) {
  if (status === "RECONCILED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "VALIDATION_FAILED" || status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "WAITING_FOR_COUNTERPART") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-");
  const parsedDate = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

async function getLpImportHistoryState(searchParams?: {
  month?: string;
  status?: string;
}): Promise<ImportHistoryState> {
  const mockMode = process.env.MOCK_LP_IMPORT_HISTORY_STATE;
  const monthFilter = searchParams?.month?.trim() ?? "";
  const statusFilter = searchParams?.status?.trim() ?? "";

  if (mockMode === "loading") {
    return { kind: "loading" };
  }

  if (mockMode === "error") {
    return {
      kind: "error",
      message:
        "We could not load LP import history right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }

  const filteredRows = mockRows.filter((row) => {
    const monthMatch = !monthFilter || row.month === monthFilter;
    const statusMatch = !statusFilter || row.status === statusFilter;
    return monthMatch && statusMatch;
  });

  if (mockMode === "empty" || filteredRows.length === 0) {
    return {
      kind: "empty",
      lpName: "Northstar Beverage Group",
      filters: {
        month: monthFilter,
        status: statusFilter,
      },
    };
  }

  return {
    kind: "ready",
    lpName: "Northstar Beverage Group",
    filters: {
      month: monthFilter,
      status: statusFilter,
    },
    rows: filteredRows,
  };
}

function StatusBadge({ status }: { status: ImportBatchStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusTone(status)}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function FilterForm({
  filters,
}: {
  filters: {
    month: string;
    status: string;
  };
}) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg text-white">Filters</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          Narrow import batches by reporting month or processing state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 md:grid-cols-[0.9fr_0.9fr_auto]">
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
                "RECEIVED",
                "VALIDATING",
                "VALIDATION_FAILED",
                "WAITING_FOR_COUNTERPART",
                "RECONCILING",
                "RECONCILED",
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
              <Link href="/lp/uploads">Reset</Link>
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
          Import history unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          LP import history could not be loaded
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
          <Link href="/lp/uploads/new">Upload monthly file</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  lpName,
  filters,
}: {
  lpName: string;
  filters: {
    month: string;
    status: string;
  };
}) {
  const hasFilters = Boolean(filters.month || filters.status);

  return (
    <div className="space-y-6">
      <FilterForm filters={filters} />

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No import batches found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No LP upload batches match the current filters."
              : `There are no LP import batches yet for ${lpName}.`}
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
              <Link href="/lp/uploads">Clear filters</Link>
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
  state: Extract<ImportHistoryState, { kind: "ready" }>;
}) {
  return (
    <div className="space-y-6">
      <FilterForm filters={state.filters} />

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">
            LP import batches
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Previous LP uploads and their current processing status for{" "}
            {state.lpName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.rows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
            >
              <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr_0.9fr_0.8fr_0.8fr_1fr_0.9fr_0.9fr_0.9fr_auto] xl:items-center">
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
                    Uploaded file name
                  </div>
                  <div className="text-sm font-medium text-white">
                    {row.uploadedFileName}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Uploaded at
                  </div>
                  <div className="text-sm text-slate-300">{row.uploadedAt}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Uploaded by
                  </div>
                  <div className="text-sm text-slate-300">{row.uploadedBy}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Source type
                  </div>
                  <div className="text-sm text-slate-300">{row.sourceType}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Status
                  </div>
                  <StatusBadge status={row.status} />
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Total rows
                  </div>
                  <div className="text-sm text-slate-300">{row.totalRows}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Valid rows
                  </div>
                  <div className="text-sm text-emerald-200">{row.validRows}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Invalid rows
                  </div>
                  <div className="text-sm text-red-200">{row.invalidRows}</div>
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Link href={`/lp/uploads/${row.id}`}>View details</Link>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    Reprocess
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

export default async function LpImportHistoryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    status?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const state = await getLpImportHistoryState(resolvedSearchParams);

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
            LP Import History
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Previous LP uploads and processing status
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review past LP import batches, validation outcomes, and current
              reconciliation status across monthly reporting periods.
            </p>
          </div>
        </header>

        {state.kind === "loading" ? <LoadingState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? (
          <EmptyState lpName={state.lpName} filters={state.filters} />
        ) : null}
        {state.kind === "ready" ? <ReadyState state={state} /> : null}
      </div>
    </main>
  );
}
