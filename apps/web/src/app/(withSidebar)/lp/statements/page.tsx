import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type StatementStatus = "DRAFT" | "FINAL" | "FAILED";

type StatementRow = {
  id: string;
  cycleId: string;
  month: string;
  storeOrganization: string;
  storeLocation: string;
  version: number;
  status: StatementStatus;
  totalSalesAmount: number;
  totalCommissionAmount: number;
  generatedAt: string;
  fileName: string | null;
};

type StatementFilters = {
  month: string;
  storeLocation: string;
  status: string;
  cycleId: string;
  statementId: string;
};

type StatementsState =
  | {
      kind: "ready";
      lpName: string;
      filters: StatementFilters;
      rows: StatementRow[];
      selectedStatement: StatementRow | null;
      availableStoreLocations: string[];
      summary: {
        finalCount: number;
        draftCount: number;
        totalSalesAmount: number;
        totalCommissionAmount: number;
      };
    }
  | {
      kind: "empty";
      lpName: string;
      filters: StatementFilters;
      availableStoreLocations: string[];
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "loading";
    };

const mockRows: StatementRow[] = [
  {
    id: "stmt_apr_downtown_v2",
    cycleId: "cycle_apr_downtown",
    month: "2026-04",
    storeOrganization: "Maple Retail Group",
    storeLocation: "Toronto Downtown",
    version: 2,
    status: "FINAL",
    totalSalesAmount: 21452.19,
    totalCommissionAmount: 2788.64,
    generatedAt: "Apr 10, 2026 09:18 AM",
    fileName: "statement_apr_2026_toronto_downtown_v2.pdf",
  },
  {
    id: "stmt_apr_downtown_v1",
    cycleId: "cycle_apr_downtown",
    month: "2026-04",
    storeOrganization: "Maple Retail Group",
    storeLocation: "Toronto Downtown",
    version: 1,
    status: "DRAFT",
    totalSalesAmount: 21398.77,
    totalCommissionAmount: 2776.15,
    generatedAt: "Apr 9, 2026 05:42 PM",
    fileName: null,
  },
  {
    id: "stmt_apr_waterfront_v1",
    cycleId: "cycle_apr_waterfront",
    month: "2026-04",
    storeOrganization: "Maple Retail Group",
    storeLocation: "Toronto Waterfront",
    version: 1,
    status: "DRAFT",
    totalSalesAmount: 18421.08,
    totalCommissionAmount: 2384.77,
    generatedAt: "Apr 10, 2026 08:31 AM",
    fileName: null,
  },
  {
    id: "stmt_mar_mississauga_v3",
    cycleId: "cycle_mar_mississauga",
    month: "2026-03",
    storeOrganization: "Summit Stores",
    storeLocation: "Mississauga Central",
    version: 3,
    status: "FINAL",
    totalSalesAmount: 19874.54,
    totalCommissionAmount: 2571.83,
    generatedAt: "Apr 3, 2026 02:16 PM",
    fileName: "statement_mar_2026_mississauga_central_v3.pdf",
  },
  {
    id: "stmt_feb_northyork_v2",
    cycleId: "cycle_feb_northyork",
    month: "2026-02",
    storeOrganization: "Summit Stores",
    storeLocation: "North York East",
    version: 2,
    status: "FAILED",
    totalSalesAmount: 17652.91,
    totalCommissionAmount: 2289.33,
    generatedAt: "Mar 8, 2026 04:07 PM",
    fileName: null,
  },
  {
    id: "stmt_jan_brampton_v1",
    cycleId: "cycle_jan_brampton",
    month: "2026-01",
    storeOrganization: "Metro Beverage Partners",
    storeLocation: "Brampton West",
    version: 1,
    status: "FINAL",
    totalSalesAmount: 16443.5,
    totalCommissionAmount: 2132.41,
    generatedAt: "Feb 6, 2026 10:11 AM",
    fileName: "statement_jan_2026_brampton_west_v1.pdf",
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getStatusTone(status: StatementStatus) {
  if (status === "FINAL") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  return "border-amber-400/30 bg-amber-500/10 text-amber-100";
}

function buildStatementsHref(filters: StatementFilters) {
  const params = new URLSearchParams();

  if (filters.month) {
    params.set("month", filters.month);
  }

  if (filters.storeLocation) {
    params.set("storeLocation", filters.storeLocation);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.cycleId) {
    params.set("cycleId", filters.cycleId);
  }

  if (filters.statementId) {
    params.set("statementId", filters.statementId);
  }

  const query = params.toString();
  return query ? `/lp/statements?${query}` : "/lp/statements";
}

async function getLpStatementsState(searchParams?: {
  month?: string;
  storeLocation?: string;
  status?: string;
  cycleId?: string;
  statementId?: string;
}): Promise<StatementsState> {
  const mockMode = process.env.MOCK_LP_STATEMENTS_STATE;
  const filters: StatementFilters = {
    month: searchParams?.month?.trim() ?? "",
    storeLocation: searchParams?.storeLocation?.trim() ?? "",
    status: searchParams?.status?.trim() ?? "",
    cycleId: searchParams?.cycleId?.trim() ?? "",
    statementId: searchParams?.statementId?.trim() ?? "",
  };

  if (mockMode === "loading") {
    return { kind: "loading" };
  }

  if (mockMode === "error") {
    return {
      kind: "error",
      message:
        "We could not load LP statements right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }

  const availableStoreLocations = Array.from(
    new Set(mockRows.map((row) => row.storeLocation)),
  ).sort();

  const filteredRows = mockRows.filter((row) => {
    const monthMatch = !filters.month || row.month === filters.month;
    const storeLocationMatch =
      !filters.storeLocation || row.storeLocation === filters.storeLocation;
    const statusMatch = !filters.status || row.status === filters.status;
    const cycleMatch = !filters.cycleId || row.cycleId === filters.cycleId;

    return monthMatch && storeLocationMatch && statusMatch && cycleMatch;
  });

  if (mockMode === "empty" || filteredRows.length === 0) {
    return {
      kind: "empty",
      lpName: "Northstar Beverage Group",
      filters,
      availableStoreLocations,
    };
  }

  const selectedStatement =
    filteredRows.find((row) => row.id === filters.statementId) ??
    filteredRows[0] ??
    null;

  return {
    kind: "ready",
    lpName: "Northstar Beverage Group",
    filters,
    rows: filteredRows,
    selectedStatement,
    availableStoreLocations,
    summary: {
      finalCount: filteredRows.filter((row) => row.status === "FINAL").length,
      draftCount: filteredRows.filter((row) => row.status === "DRAFT").length,
      totalSalesAmount: filteredRows.reduce(
        (sum, row) => sum + row.totalSalesAmount,
        0,
      ),
      totalCommissionAmount: filteredRows.reduce(
        (sum, row) => sum + row.totalCommissionAmount,
        0,
      ),
    },
  };
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
  tone: "neutral" | "success" | "warning";
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

function FilterForm({
  filters,
  storeLocations,
}: {
  filters: StatementFilters;
  storeLocations: string[];
}) {
  const resetHref = buildStatementsHref({
    ...filters,
    month: "",
    storeLocation: "",
    status: "",
    statementId: "",
  });

  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg text-white">Filters</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          Narrow statement versions by reporting month, store location, or
          statement status.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr_0.9fr_auto]">
          {filters.cycleId ? (
            <input name="cycleId" type="hidden" value={filters.cycleId} />
          ) : null}

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
              {["DRAFT", "FINAL", "FAILED"].map((status) => (
                <option
                  key={status}
                  value={status}
                  className="bg-slate-950 text-white"
                >
                  {status}
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
              <Link href={resetHref}>Reset</Link>
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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card
            key={item}
            className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
          >
            <CardHeader className="space-y-3">
              <div className="h-3 w-36 animate-pulse rounded bg-white/10" />
              <div className="h-10 w-32 animate-pulse rounded bg-white/10" />
            </CardHeader>
            <CardContent>
              <div className="h-10 animate-pulse rounded-xl bg-white/8" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-3">
          <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
          <div className="h-10 animate-pulse rounded-xl bg-white/8" />
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="h-5 w-56 animate-pulse rounded bg-white/10" />
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

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="h-5 w-44 animate-pulse rounded bg-white/10" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-14 animate-pulse rounded-xl bg-white/8"
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Statements unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          LP statements could not be loaded
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
          <Link href="/lp/cycles">Open cycles</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  lpName,
  filters,
  availableStoreLocations,
}: Extract<StatementsState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.month || filters.storeLocation || filters.status || filters.cycleId,
  );

  return (
    <div className="space-y-6">
      <FilterForm filters={filters} storeLocations={availableStoreLocations} />

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No statements found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No statement versions match the current filters."
              : `There are no generated statements yet for ${lpName}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            asChild
            className="bg-white text-slate-950 hover:bg-slate-100"
          >
            <Link href="/lp/cycles">Review reconciliation cycles</Link>
          </Button>
          {hasFilters ? (
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <Link
                href={buildStatementsHref({
                  ...filters,
                  month: "",
                  storeLocation: "",
                  status: "",
                  statementId: "",
                })}
              >
                Clear filters
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ReadyState({
  lpName,
  filters,
  rows,
  selectedStatement,
  availableStoreLocations,
  summary,
}: Extract<StatementsState, { kind: "ready" }>) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Final Versions"
          value={String(summary.finalCount)}
          detail="Statement versions finalized and ready for downstream use."
          tone="success"
        />
        <SummaryCard
          label="Draft Versions"
          value={String(summary.draftCount)}
          detail="Generated drafts still pending review or replacement."
          tone="warning"
        />
        <SummaryCard
          label="Sales Amount"
          value={formatCurrency(summary.totalSalesAmount)}
          detail="Aggregate sales volume across the filtered statement set."
          tone="neutral"
        />
        <SummaryCard
          label="Commission Amount"
          value={formatCurrency(summary.totalCommissionAmount)}
          detail="Aggregate commission value across the filtered statement set."
          tone="neutral"
        />
      </div>

      <FilterForm filters={filters} storeLocations={availableStoreLocations} />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">
              Statement versions
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Browse generated statement versions for {lpName}. Download routing
              is still a placeholder until file delivery is connected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((row) => {
              const isSelected = row.id === selectedStatement?.id;
              const viewHref = `/lp/statements/${row.id}`;

              return (
                <div
                  key={row.id}
                  className={`rounded-2xl border px-4 py-4 ${
                    isSelected
                      ? "border-cyan-400/30 bg-cyan-400/10"
                      : "border-white/8 bg-slate-950/35"
                  }`}
                >
                  <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr_1fr_0.6fr_0.7fr_0.9fr_0.9fr_0.9fr_auto] xl:items-start">
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
                      <div className="text-sm text-slate-300">
                        {row.storeLocation}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Version
                      </div>
                      <div className="text-sm text-white">v{row.version}</div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Status
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusTone(row.status)}`}
                      >
                        {row.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Total sales amount
                      </div>
                      <div className="text-sm text-white">
                        {formatCurrency(row.totalSalesAmount)}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Total commission amount
                      </div>
                      <div className="text-sm text-white">
                        {formatCurrency(row.totalCommissionAmount)}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Generated at
                      </div>
                      <div className="text-sm text-slate-300">
                        {row.generatedAt}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                      >
                        <Link href={viewHref}>View statement</Link>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={!row.fileName}
                        className="text-slate-300 hover:bg-white/5 hover:text-white disabled:text-slate-500"
                      >
                        Download file
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">
              Selected statement
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Inspect the currently selected statement version and financial
              totals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedStatement ? (
              <>
                <DetailRow label="Statement ID" value={selectedStatement.id} />
                <DetailRow
                  label="Month"
                  value={formatMonthLabel(selectedStatement.month)}
                />
                <DetailRow
                  label="Store organization"
                  value={selectedStatement.storeOrganization}
                />
                <DetailRow
                  label="Store location"
                  value={selectedStatement.storeLocation}
                />
                <DetailRow
                  label="Version"
                  value={`v${selectedStatement.version}`}
                />
                <DetailRow
                  label="Status"
                  value={
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusTone(selectedStatement.status)}`}
                    >
                      {selectedStatement.status}
                    </span>
                  }
                />
                <DetailRow
                  label="Total sales"
                  value={formatCurrency(selectedStatement.totalSalesAmount)}
                />
                <DetailRow
                  label="Total commission"
                  value={formatCurrency(
                    selectedStatement.totalCommissionAmount,
                  )}
                />
                <DetailRow
                  label="Generated at"
                  value={selectedStatement.generatedAt}
                />
                <DetailRow
                  label="Download file"
                  value={
                    selectedStatement.fileName ?? "Pending file generation"
                  }
                />
                <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/25 px-4 py-4 text-sm leading-6 text-slate-300">
                  Statement viewing and file download endpoints can be connected
                  later without changing this page structure. The selected
                  statement state is already URL-driven through `statementId`.
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-6 text-sm text-slate-300">
                Select a statement version to view details.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function LpStatementsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    storeLocation?: string;
    status?: string;
    cycleId?: string;
    statementId?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const state = await getLpStatementsState(resolvedSearchParams);

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
            LP Statements
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Generated statement versions and totals
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Browse statement versions across reporting periods, compare
              financial totals, and prepare downstream review or file delivery.
            </p>
          </div>
        </header>

        {state.kind === "loading" ? <LoadingState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? (
          <EmptyState
            kind="empty"
            lpName={state.lpName}
            filters={state.filters}
            availableStoreLocations={state.availableStoreLocations}
          />
        ) : null}
        {state.kind === "ready" ? (
          <ReadyState
            kind="ready"
            lpName={state.lpName}
            filters={state.filters}
            rows={state.rows}
            selectedStatement={state.selectedStatement}
            availableStoreLocations={state.availableStoreLocations}
            summary={state.summary}
          />
        ) : null}
      </div>
    </main>
  );
}
