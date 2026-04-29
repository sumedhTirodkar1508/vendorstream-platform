import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type ImportBatchStatus } from "@vendorstream/database";
import { FileSpreadsheet } from "lucide-react";
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

type ImportHistoryRow = {
  id: string;
  month: Date;
  uploadedFileName: string;
  uploadedAt: Date;
  uploadedBy: string;
  sourceType: "LP";
  status: ImportBatchStatus;
  totalRows: number | null;
  validRows: number | null;
  invalidRows: number | null;
};

type ImportHistoryFilters = {
  month: string;
  status: string;
};

type ImportHistoryState =
  | {
      kind: "ready";
      lpName: string;
      filters: ImportHistoryFilters;
      rows: ImportHistoryRow[];
      isAdminPreview: boolean;
    }
  | {
      kind: "empty";
      lpName: string;
      filters: ImportHistoryFilters;
      isAdminPreview: boolean;
      isAccessEmpty: boolean;
    }
  | {
      kind: "error";
      message: string;
    };

const STATUS_OPTIONS: ImportBatchStatus[] = [
  "RECEIVED",
  "PREVALIDATION_FAILED",
  "VALIDATING",
  "VALIDATION_FAILED",
  "STAGED",
  "WAITING_FOR_COUNTERPART",
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
  "RECONCILED",
  "FAILED",
  "CANCELED",
];

function getStatusTone(status: ImportBatchStatus) {
  if (status === "RECONCILED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (
    status === "PREVALIDATION_FAILED" ||
    status === "VALIDATION_FAILED" ||
    status === "FAILED" ||
    status === "CANCELED"
  ) {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (
    status === "RECEIVED" ||
    status === "VALIDATING" ||
    status === "WAITING_FOR_COUNTERPART"
  ) {
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

async function getLpImportHistoryState(searchParams?: {
  month?: string;
  status?: string;
}): Promise<ImportHistoryState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    redirect("/login");
  }

  const filters: ImportHistoryFilters = {
    month: searchParams?.month?.trim() ?? "",
    status: searchParams?.status?.trim() ?? "",
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
        isAdminPreview: false,
        isAccessEmpty: true,
      };
    }

    const monthRange = parseMonthFilter(filters.month);
    const statusFilter = STATUS_OPTIONS.includes(filters.status as ImportBatchStatus)
      ? (filters.status as ImportBatchStatus)
      : undefined;

    const where = {
      sourceType: "LP" as const,
      cycle: {
        lpId: {
          in: context.lpIds,
        },
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
    };

    const rows = await prisma.importBatch.findMany({
      where,
      orderBy: [{ cycle: { periodMonth: "desc" } }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        sourceType: true,
        status: true,
        totalRowCount: true,
        validRowCount: true,
        invalidRowCount: true,
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
        cycle: {
          select: {
            periodMonth: true,
          },
        },
        _count: {
          select: {
            rawLpRows: true,
            normalizedLpRows: true,
          },
        },
      },
    });

    if (rows.length === 0) {
      return {
        kind: "empty",
        lpName: context.displayName,
        filters,
        isAdminPreview: context.isFallbackContext,
        isAccessEmpty: false,
      };
    }

    return {
      kind: "ready",
      lpName: context.displayName,
      filters,
      isAdminPreview: context.isFallbackContext,
      rows: rows.map((row) => {
        const totalRows = row.totalRowCount ?? row._count.rawLpRows;
        const validRows = row.validRowCount ?? row._count.normalizedLpRows;
        const invalidRows =
          row.invalidRowCount ??
          (totalRows !== null && validRows !== null
            ? Math.max(totalRows - validRows, 0)
            : null);

        return {
          id: row.id,
          month: row.cycle.periodMonth,
          uploadedFileName: row.uploadedFile.originalFilename,
          uploadedAt: row.uploadedFile.uploadedAt,
          uploadedBy:
            row.uploadedBy?.name ?? row.uploadedBy?.email ?? "VendorStream User",
          sourceType: "LP",
          status: row.status,
          totalRows,
          validRows,
          invalidRows,
        };
      }),
    };
  } catch (error) {
    console.error("Failed to load LP import history", error);

    return {
      kind: "error",
      message:
        "We could not load LP import history right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function FilterForm({
  filters,
}: {
  filters: ImportHistoryFilters;
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
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
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
  isAdminPreview,
  isAccessEmpty,
}: {
  lpName: string;
  filters: ImportHistoryFilters;
  isAdminPreview: boolean;
  isAccessEmpty: boolean;
}) {
  const hasFilters = Boolean(filters.month || filters.status);

  return (
    <div className="space-y-6">
      <FilterForm filters={filters} />

      {isAdminPreview ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
          Admin preview is showing LP upload activity across active LP
          workspaces because no explicit LP membership is attached to this user.
        </div>
      ) : null}

      <AppEmptyState
        icon={<FileSpreadsheet className="h-5 w-5" />}
        title="No import batches found"
        description={
          isAccessEmpty
            ? "This account is not assigned to any LP workspace yet."
            : hasFilters
              ? "No LP upload batches match the current filters."
              : `There are no LP import batches yet for ${lpName}.`
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
                <Link href="/lp/uploads">Clear filters</Link>
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
  state: Extract<ImportHistoryState, { kind: "ready" }>;
}) {
  return (
    <div className="space-y-6">
      <FilterForm filters={state.filters} />

      {state.isAdminPreview ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
          Admin preview is showing LP upload activity across active LP
          workspaces because no explicit LP membership is attached to this user.
        </div>
      ) : null}

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
                  <div className="text-sm text-slate-300">
                    {formatDateTime(row.uploadedAt)}
                  </div>
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
                  <StatusBadge
                    label={row.status.replaceAll("_", " ")}
                    className={getStatusTone(row.status)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Total rows
                  </div>
                  <div className="text-sm text-slate-300">
                    {row.totalRows ?? "N/A"}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Valid rows
                  </div>
                  <div className="text-sm text-emerald-200">
                    {row.validRows ?? "N/A"}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    Invalid rows
                  </div>
                  <div className="text-sm text-red-200">
                    {row.invalidRows ?? "N/A"}
                  </div>
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
                    disabled
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

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? (
          <EmptyState
            lpName={state.lpName}
            filters={state.filters}
            isAdminPreview={state.isAdminPreview}
            isAccessEmpty={state.isAccessEmpty}
          />
        ) : null}
        {state.kind === "ready" ? <ReadyState state={state} /> : null}
      </div>
    </main>
  );
}
