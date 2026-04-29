import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type Prisma, type StatementStatus } from "@vendorstream/database";
import { FileText } from "lucide-react";
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
import { formatDateTime, formatMonthLabel } from "@/lib/formatting";

type StatementRow = {
  id: string;
  cycleId: string;
  month: Date;
  storeOrganization: string;
  storeLocationId: string;
  storeLocation: string;
  version: number;
  status: StatementStatus;
  currency: string;
  totalSalesAmount: Prisma.Decimal | null;
  totalCommissionAmount: Prisma.Decimal | null;
  generatedAt: Date | null;
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
      availableStoreLocations: Array<{
        id: string;
        label: string;
      }>;
      summary: {
        finalCount: number;
        draftCount: number;
        totalSalesAmount: number;
        totalCommissionAmount: number;
      };
      isAdminPreview: boolean;
    }
  | {
      kind: "empty";
      lpName: string;
      filters: StatementFilters;
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

const STATUS_OPTIONS: StatementStatus[] = ["DRAFT", "FINAL", "FAILED"];

function formatCurrency(value: number, currency = "CAD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
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

function parseMonthFilter(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map((part) => Number(part));
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { start, end };
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value ? value.toNumber() : 0;
}

async function getLpStatementsState(searchParams?: {
  month?: string;
  storeLocation?: string;
  status?: string;
  cycleId?: string;
  statementId?: string;
}): Promise<StatementsState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    redirect("/login");
  }

  const filters: StatementFilters = {
    month: searchParams?.month?.trim() ?? "",
    storeLocation: searchParams?.storeLocation?.trim() ?? "",
    status: searchParams?.status?.trim() ?? "",
    cycleId: searchParams?.cycleId?.trim() ?? "",
    statementId: searchParams?.statementId?.trim() ?? "",
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
    const statusFilter = STATUS_OPTIONS.includes(filters.status as StatementStatus)
      ? (filters.status as StatementStatus)
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
      prisma.statement.findMany({
        where: {
          cycle: {
            lpId: {
              in: context.lpIds,
            },
            ...(filters.storeLocation
              ? { storeLocationId: filters.storeLocation }
              : {}),
            ...(filters.cycleId ? { id: filters.cycleId } : {}),
            ...(monthRange
              ? {
                  periodMonth: {
                    gte: monthRange.start,
                    lt: monthRange.end,
                  },
                }
              : {}),
          },
          ...(statusFilter ? { status: statusFilter } : {}),
        },
        orderBy: [
          { generatedAt: "desc" },
          { createdAt: "desc" },
          { version: "desc" },
        ],
        take: 100,
        select: {
          id: true,
          cycleId: true,
          version: true,
          status: true,
          currency: true,
          totalSalesAmount: true,
          totalCommissionAmount: true,
          generatedAt: true,
          generatedFile: {
            select: {
              originalFilename: true,
            },
          },
          cycle: {
            select: {
              periodMonth: true,
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

    const mappedRows: StatementRow[] = rows.map((row) => ({
      id: row.id,
      cycleId: row.cycleId,
      month: row.cycle.periodMonth,
      storeOrganization: row.cycle.storeLocation.storeOrganization.name,
      storeLocationId: row.cycle.storeLocation.id,
      storeLocation: row.cycle.storeLocation.name,
      version: row.version,
      status: row.status,
      currency: row.currency,
      totalSalesAmount: row.totalSalesAmount,
      totalCommissionAmount: row.totalCommissionAmount,
      generatedAt: row.generatedAt,
      fileName: row.generatedFile?.originalFilename ?? null,
    }));

    const selectedStatement =
      mappedRows.find((row) => row.id === filters.statementId) ??
      mappedRows[0] ??
      null;

    return {
      kind: "ready",
      lpName: context.displayName,
      filters,
      rows: mappedRows,
      selectedStatement,
      availableStoreLocations,
      isAdminPreview: context.isFallbackContext,
      summary: {
        finalCount: mappedRows.filter((row) => row.status === "FINAL").length,
        draftCount: mappedRows.filter((row) => row.status === "DRAFT").length,
        totalSalesAmount: mappedRows.reduce(
          (sum, row) => sum + decimalToNumber(row.totalSalesAmount),
          0,
        ),
        totalCommissionAmount: mappedRows.reduce(
          (sum, row) => sum + decimalToNumber(row.totalCommissionAmount),
          0,
        ),
      },
    };
  } catch (error) {
    console.error("Failed to load LP statements", error);

    return {
      kind: "error",
      message:
        "We could not load LP statements right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
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
  storeLocations: Array<{
    id: string;
    label: string;
  }>;
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
                  key={storeLocation.id}
                  value={storeLocation.id}
                  className="bg-slate-950 text-white"
                >
                  {storeLocation.label}
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
              {STATUS_OPTIONS.map((status) => (
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
  isAdminPreview,
  isAccessEmpty,
}: Extract<StatementsState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.month || filters.storeLocation || filters.status || filters.cycleId,
  );

  return (
    <div className="space-y-6">
      <FilterForm filters={filters} storeLocations={availableStoreLocations} />

      {isAdminPreview ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
          Admin preview is showing LP statement activity across active LP
          workspaces because no explicit LP membership is attached to this user.
        </div>
      ) : null}

      <AppEmptyState
        icon={<FileText className="h-5 w-5" />}
        title="No statements found"
        description={
          isAccessEmpty
            ? "This account is not assigned to any LP workspace yet."
            : hasFilters
              ? "No statement versions match the current filters."
              : `There are no generated statements yet for ${lpName}.`
        }
        actions={
          <>
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
          </>
        }
      />
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
  isAdminPreview,
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

      {isAdminPreview ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
          Admin preview is showing LP statement activity across active LP
          workspaces because no explicit LP membership is attached to this user.
        </div>
      ) : null}

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
              const viewHref = buildStatementsHref({
                ...filters,
                statementId: row.id,
              });

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
                      <StatusBadge
                        label={row.status}
                        className={getStatusTone(row.status)}
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Total sales amount
                      </div>
                      <div className="text-sm text-white">
                        {formatCurrency(
                          decimalToNumber(row.totalSalesAmount),
                          row.currency,
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Total commission amount
                      </div>
                      <div className="text-sm text-white">
                        {formatCurrency(
                          decimalToNumber(row.totalCommissionAmount),
                          row.currency,
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Generated at
                      </div>
                      <div className="text-sm text-slate-300">
                        {formatDateTime(row.generatedAt)}
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
                    <StatusBadge
                      label={selectedStatement.status}
                      className={getStatusTone(selectedStatement.status)}
                    />
                  }
                />
                <DetailRow
                  label="Total sales"
                  value={formatCurrency(
                    decimalToNumber(selectedStatement.totalSalesAmount),
                    selectedStatement.currency,
                  )}
                />
                <DetailRow
                  label="Total commission"
                  value={formatCurrency(
                    decimalToNumber(selectedStatement.totalCommissionAmount),
                    selectedStatement.currency,
                  )}
                />
                <DetailRow
                  label="Generated at"
                  value={formatDateTime(selectedStatement.generatedAt)}
                />
                <DetailRow
                  label="Download file"
                  value={selectedStatement.fileName ?? "Pending file generation"}
                />
                <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/25 px-4 py-4 text-sm leading-6 text-slate-300">
                  The statement list and selected-version panel now use real
                  Prisma data. Detailed LP-side statement delivery and download
                  endpoints can be connected separately without changing this page
                  structure.
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

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? (
          <EmptyState
            kind="empty"
            lpName={state.lpName}
            filters={state.filters}
            availableStoreLocations={state.availableStoreLocations}
            isAdminPreview={state.isAdminPreview}
            isAccessEmpty={state.isAccessEmpty}
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
            isAdminPreview={state.isAdminPreview}
          />
        ) : null}
      </div>
    </main>
  );
}
