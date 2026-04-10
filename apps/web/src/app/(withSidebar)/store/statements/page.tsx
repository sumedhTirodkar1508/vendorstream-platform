import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type StatementStatus } from "@vendorstream/database";
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

type StatementRow = {
  id: string;
  cycleId: string;
  month: Date;
  lpId: string;
  lpName: string;
  storeOrganizationName: string;
  storeLocationId: string;
  storeLocationName: string;
  version: number;
  status: StatementStatus;
  currency: string;
  totalSalesAmount: string;
  totalCommissionAmount: string;
  generatedAt: Date | null;
  generatedFile: {
    id: string;
    originalFilename: string;
    bucket: string;
    storagePath: string;
    mimeType: string | null;
  } | null;
};

type StatementFilters = {
  month: string;
  storeLocation: string;
  status: string;
  lp: string;
  statementId: string;
};

type StoreStatementsPageState =
  | {
      kind: "ready";
      context: {
        primaryStoreOrganizationName: string;
        totalStoreOrganizations: number;
        totalLocations: number;
        isFallbackContext: boolean;
      };
      filters: StatementFilters;
      rows: StatementRow[];
      selectedStatement: StatementRow | null;
      lpOptions: Array<{
        id: string;
        name: string;
      }>;
      locationOptions: Array<{
        id: string;
        name: string;
      }>;
      summary: {
        finalCount: number;
        draftCount: number;
        failedCount: number;
        linkedFileCount: number;
      };
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
      filters: StatementFilters;
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

const STATUS_OPTIONS: StatementStatus[] = ["DRAFT", "FINAL", "FAILED"];

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

function formatStatementStatus(status: StatementStatus) {
  return status.replaceAll("_", " ");
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

function parseMonthFilter(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month] = value.split("-").map((part) => Number(part));
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

  return { start, end };
}

function formatCurrencyValue(
  value: { toNumber?: () => number } | number | string | null | undefined,
  currency: string,
) {
  if (value === null || value === undefined) {
    return "N/A";
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : typeof value.toNumber === "function"
          ? value.toNumber()
          : Number(value);

  if (!Number.isFinite(numericValue)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
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

async function getStoreStatementsPageState(searchParams?: {
  month?: string;
  storeLocation?: string;
  status?: string;
  lp?: string;
  statementId?: string;
}): Promise<StoreStatementsPageState> {
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
    lp: searchParams?.lp?.trim() ?? "",
    statementId: searchParams?.statementId?.trim() ?? "",
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
    const statusFilter = STATUS_OPTIONS.includes(filters.status as StatementStatus)
      ? (filters.status as StatementStatus)
      : undefined;

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      cycle: {
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
      },
    };

    const rows = await prisma.statement.findMany({
      where,
      orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }],
      take: 40,
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
            id: true,
            originalFilename: true,
            bucket: true,
            storagePath: true,
            mimeType: true,
          },
        },
        cycle: {
          select: {
            id: true,
            lpId: true,
            periodMonth: true,
            lp: {
              select: {
                name: true,
              },
            },
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

    const mappedRows: StatementRow[] = rows.map((row) => ({
      id: row.id,
      cycleId: row.cycleId,
      month: row.cycle.periodMonth,
      lpId: row.cycle.lpId,
      lpName: row.cycle.lp.name,
      storeOrganizationName: row.cycle.storeLocation.storeOrganization.name,
      storeLocationId: row.cycle.storeLocation.id,
      storeLocationName: row.cycle.storeLocation.name,
      version: row.version,
      status: row.status,
      currency: row.currency,
      totalSalesAmount: formatCurrencyValue(row.totalSalesAmount, row.currency),
      totalCommissionAmount: formatCurrencyValue(
        row.totalCommissionAmount,
        row.currency,
      ),
      generatedAt: row.generatedAt,
      generatedFile: row.generatedFile
        ? {
            id: row.generatedFile.id,
            originalFilename: row.generatedFile.originalFilename,
            bucket: row.generatedFile.bucket,
            storagePath: row.generatedFile.storagePath,
            mimeType: row.generatedFile.mimeType,
          }
        : null,
    }));

    const selectedStatement =
      mappedRows.find((row) => row.id === filters.statementId) ??
      mappedRows[0] ??
      null;

    return {
      kind: "ready",
      context: {
        primaryStoreOrganizationName:
          context.primaryStoreOrganizationName ?? "Store Organization",
        totalStoreOrganizations: context.totalStoreOrganizations,
        totalLocations: context.totalLocations,
        isFallbackContext: context.isFallbackContext,
      },
      filters,
      rows: mappedRows,
      selectedStatement,
      lpOptions,
      locationOptions,
      summary: {
        finalCount: mappedRows.filter((row) => row.status === "FINAL").length,
        draftCount: mappedRows.filter((row) => row.status === "DRAFT").length,
        failedCount: mappedRows.filter((row) => row.status === "FAILED").length,
        linkedFileCount: mappedRows.filter((row) => row.generatedFile !== null)
          .length,
      },
    };
  } catch (error) {
    console.error("Failed to load store statements page", error);

    return {
      kind: "error",
      message:
        "We could not load store statements right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function FilterBar({
  filters,
  lpOptions,
  locationOptions,
}: {
  filters: StatementFilters;
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
          Narrow statement records by month, store location, status, or LP.
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
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status} className="bg-slate-950 text-white">
                  {formatStatementStatus(status)}
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
              <Link href="/store/statements">Reset</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  context,
  filters,
  lpOptions,
  locationOptions,
  isAccessEmpty,
}: Extract<StoreStatementsPageState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.month || filters.storeLocation || filters.status || filters.lp,
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
              ? "No store statement access found"
              : "No statements found"}
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {isAccessEmpty
              ? "Your current account does not yet have any active store-side LP assignments."
              : hasFilters
                ? "No statement records match the current filters."
                : `No statements have been generated yet for ${context?.primaryStoreOrganizationName ?? "this store organization"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href="/store/cycles">Back to store cycles</Link>
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
          Statements unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Store statements could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/store/dashboard">Back to store dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function StoreStatementsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    storeLocation?: string;
    status?: string;
    lp?: string;
    statementId?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const state = await getStoreStatementsPageState(resolvedSearchParams);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            Store Statements
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Store statements
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Browse statement versions relevant to your store organizations and
              locations, including totals, generation status, and linked output files.
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
              Viewing statements for{" "}
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
              <SummaryCard
                label="Final Statements"
                value={String(state.summary.finalCount)}
                detail="Finalized statement versions available to store-side users."
                tone="success"
              />
              <SummaryCard
                label="Draft Statements"
                value={String(state.summary.draftCount)}
                detail="Draft statement versions still pending finalization."
                tone="warning"
              />
              <SummaryCard
                label="Failed Statements"
                value={String(state.summary.failedCount)}
                detail="Statement versions that encountered generation failures."
                tone="warning"
              />
              <SummaryCard
                label="Linked Output Files"
                value={String(state.summary.linkedFileCount)}
                detail="Statements that already have a generated file record attached."
                tone="neutral"
              />
            </div>

            <FilterBar
              filters={state.filters}
              lpOptions={state.lpOptions}
              locationOptions={state.locationOptions}
            />

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Statement records
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real `Statement` records scoped to your current store organization access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.rows.map((row) => (
                  <div
                    key={row.id}
                    className={`rounded-2xl border px-4 py-4 ${
                      row.id === state.selectedStatement?.id
                        ? "border-cyan-400/30 bg-cyan-400/10"
                        : "border-white/8 bg-slate-950/35"
                    }`}
                  >
                    <div className="grid gap-4 xl:grid-cols-[0.75fr_1fr_1fr_1fr_0.55fr_0.7fr_0.85fr_0.9fr_0.9fr_auto] xl:items-start">
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
                          Version
                        </div>
                        <div className="text-sm text-slate-300">v{row.version}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Status
                        </div>
                        <StatusBadge
                          label={formatStatementStatus(row.status)}
                          className={getStatusTone(row.status)}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Total sales amount
                        </div>
                        <div className="text-sm text-slate-300">
                          {row.totalSalesAmount}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Total commission amount
                        </div>
                        <div className="text-sm text-slate-300">
                          {row.totalCommissionAmount}
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
                          <Link href={`/store/statements/${row.id}`}>
                            View statement details
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled
                          className="text-slate-300 disabled:text-slate-500"
                        >
                          {row.generatedFile
                            ? "Open file unavailable"
                            : "File unavailable"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {state.selectedStatement ? (
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Selected statement details
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Quick statement preview from the list view. Open the dedicated
                    detail route for line-item level detail.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  <DetailRow label="Statement ID" value={state.selectedStatement.id} />
                  <DetailRow
                    label="Cycle"
                    value={
                      <Link
                        href={`/store/cycles/${state.selectedStatement.cycleId}`}
                        className="text-cyan-200 hover:text-cyan-100"
                      >
                        Open related cycle
                      </Link>
                    }
                  />
                  <DetailRow
                    label="Version"
                    value={`v${state.selectedStatement.version}`}
                  />
                  <DetailRow
                    label="Status"
                    value={
                      <StatusBadge
                        label={formatStatementStatus(
                          state.selectedStatement.status,
                        )}
                        className={getStatusTone(state.selectedStatement.status)}
                      />
                    }
                  />
                  <DetailRow
                    label="Month"
                    value={formatMonth(state.selectedStatement.month)}
                  />
                  <DetailRow
                    label="LP"
                    value={state.selectedStatement.lpName}
                  />
                  <DetailRow
                    label="Store organization"
                    value={state.selectedStatement.storeOrganizationName}
                  />
                  <DetailRow
                    label="Store location"
                    value={state.selectedStatement.storeLocationName}
                  />
                  <DetailRow
                    label="Total sales amount"
                    value={state.selectedStatement.totalSalesAmount}
                  />
                  <DetailRow
                    label="Total commission amount"
                    value={state.selectedStatement.totalCommissionAmount}
                  />
                  <DetailRow
                    label="Generated at"
                    value={formatDateTime(state.selectedStatement.generatedAt)}
                  />
                  <DetailRow
                    label="Generated file"
                    value={
                      state.selectedStatement.generatedFile
                        ? state.selectedStatement.generatedFile.originalFilename
                        : "Not available"
                    }
                  />
                  <DetailRow
                    label="File bucket"
                    value={
                      state.selectedStatement.generatedFile?.bucket ??
                      "Not available"
                    }
                  />
                  <DetailRow
                    label="Storage path"
                    value={
                      state.selectedStatement.generatedFile?.storagePath ??
                      "Not available"
                    }
                  />
                  <DetailRow
                    label="MIME type"
                    value={
                      state.selectedStatement.generatedFile?.mimeType ??
                      "Not available"
                    }
                  />
                  <DetailRow
                    label="File access"
                    value={
                      state.selectedStatement.generatedFile
                        ? "Generated file is linked, but a signed file-delivery route is not wired yet."
                        : "No generated file is attached."
                    }
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
