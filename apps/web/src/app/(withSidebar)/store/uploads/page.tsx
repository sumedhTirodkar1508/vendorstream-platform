import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type $Enums } from "@vendorstream/database";
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

type CycleStatus = $Enums.CycleStatus;
type ImportBatchStatus = $Enums.ImportBatchStatus;

type UploadRow = {
  id: string;
  month: Date;
  lpName: string;
  storeLocationId: string;
  storeLocationName: string;
  originalFileName: string;
  uploadedBy: string;
  uploadedAt: Date | null;
  status: ImportBatchStatus;
  totalRows: number | null;
  validRows: number | null;
  invalidRows: number | null;
  cycleId: string;
  cycleStatus: CycleStatus;
  isCurrent: boolean;
};

type SummaryItem = {
  label:
    | "Total Uploads"
    | "Current Batches"
    | "In Progress"
    | "Failed or Rejected";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type UploadFilters = {
  month: string;
  status: string;
  storeLocation: string;
  batchId: string;
};

type StoreUploadsPageState =
  | {
      kind: "ready";
      context: {
        primaryStoreOrganizationName: string;
        totalStoreOrganizations: number;
        totalLocations: number;
        isFallbackContext: boolean;
      };
      summary: SummaryItem[];
      filters: UploadFilters;
      locationOptions: Array<{
        id: string;
        name: string;
      }>;
      rows: UploadRow[];
      selectedBatch: UploadRow | null;
    }
  | {
      kind: "empty";
      context: {
        primaryStoreOrganizationName: string;
        totalStoreOrganizations: number;
        totalLocations: number;
        isFallbackContext: boolean;
      } | null;
      filters: UploadFilters;
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

const IN_PROGRESS_BATCH_STATUSES: ImportBatchStatus[] = [
  "RECEIVED",
  "VALIDATING",
  "WAITING_FOR_COUNTERPART",
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
];

const FAILED_BATCH_STATUSES: ImportBatchStatus[] = [
  "PREVALIDATION_FAILED",
  "VALIDATION_FAILED",
  "FAILED",
  "CANCELED",
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

function formatBatchStatus(status: ImportBatchStatus) {
  return status.replaceAll("_", " ");
}

function formatCycleStatus(status: CycleStatus) {
  return status.replaceAll("_", " ");
}

function getBatchTone(status: ImportBatchStatus) {
  if (status === "RECONCILED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (FAILED_BATCH_STATUSES.includes(status)) {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (IN_PROGRESS_BATCH_STATUSES.includes(status)) {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
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

function buildStoreUploadsHref(
  filters: UploadFilters,
  batchId?: string | null,
) {
  const params = new URLSearchParams();

  if (filters.month) {
    params.set("month", filters.month);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.storeLocation) {
    params.set("storeLocation", filters.storeLocation);
  }

  if (batchId) {
    params.set("batchId", batchId);
  }

  const query = params.toString();
  return query ? `/store/uploads?${query}` : "/store/uploads";
}

async function getStoreUploadsPageState(searchParams?: {
  month?: string;
  status?: string;
  storeLocation?: string;
  batchId?: string;
}): Promise<StoreUploadsPageState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    redirect("/login");
  }

  const filters: UploadFilters = {
    month: searchParams?.month?.trim() ?? "",
    status: searchParams?.status?.trim() ?? "",
    storeLocation: searchParams?.storeLocation?.trim() ?? "",
    batchId: searchParams?.batchId?.trim() ?? "",
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
        locationOptions: [],
        isAccessEmpty: true,
      };
    }

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

    const scopedLocationIds = Array.from(
      new Set(context.options.map((option) => option.storeLocationId)),
    );

    const monthRange = parseMonthFilter(filters.month);

    const where = {
      sourceType: "STORE" as const,
      cycle: {
        storeLocationId: filters.storeLocation
          ? filters.storeLocation
          : {
              in: scopedLocationIds,
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
      ...(filters.status
        ? {
            status: filters.status as ImportBatchStatus,
          }
        : {}),
    };

    const [summaryCounts, rows] = await Promise.all([
      Promise.all([
        prisma.importBatch.count({
          where: {
            sourceType: "STORE",
            cycle: {
              storeLocationId: {
                in: scopedLocationIds,
              },
            },
          },
        }),
        prisma.importBatch.count({
          where: {
            sourceType: "STORE",
            isCurrent: true,
            cycle: {
              storeLocationId: {
                in: scopedLocationIds,
              },
            },
          },
        }),
        prisma.importBatch.count({
          where: {
            sourceType: "STORE",
            status: {
              in: IN_PROGRESS_BATCH_STATUSES,
            },
            cycle: {
              storeLocationId: {
                in: scopedLocationIds,
              },
            },
          },
        }),
        prisma.importBatch.count({
          where: {
            sourceType: "STORE",
            status: {
              in: FAILED_BATCH_STATUSES,
            },
            cycle: {
              storeLocationId: {
                in: scopedLocationIds,
              },
            },
          },
        }),
      ]),
      prisma.importBatch.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: 30,
        select: {
          id: true,
          status: true,
          isCurrent: true,
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
              id: true,
              periodMonth: true,
              status: true,
              lp: {
                select: {
                  name: true,
                },
              },
              storeLocation: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const mappedRows: UploadRow[] = rows.map((row: any) => ({
      id: row.id,
      month: row.cycle.periodMonth,
      lpName: row.cycle.lp.name,
      storeLocationId: row.cycle.storeLocation.id,
      storeLocationName: row.cycle.storeLocation.name,
      originalFileName: row.uploadedFile.originalFilename,
      uploadedBy:
        row.uploadedBy?.name || row.uploadedBy?.email || "Unknown uploader",
      uploadedAt: row.uploadedFile.uploadedAt,
      status: row.status,
      totalRows: row.totalRowCount,
      validRows: row.validRowCount,
      invalidRows: row.invalidRowCount,
      cycleId: row.cycle.id,
      cycleStatus: row.cycle.status,
      isCurrent: row.isCurrent,
    }));

    if (mappedRows.length === 0) {
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
        locationOptions,
        isAccessEmpty: false,
      };
    }

    const selectedBatch =
      mappedRows.find((row) => row.id === filters.batchId) ??
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
      summary: [
        {
          label: "Total Uploads",
          value: String(summaryCounts[0]),
          detail:
            "Store-side import batches recorded across your current access scope.",
          tone: "neutral",
        },
        {
          label: "Current Batches",
          value: String(summaryCounts[1]),
          detail:
            "Batches currently marked as the active store batch for their cycles.",
          tone: "success",
        },
        {
          label: "In Progress",
          value: String(summaryCounts[2]),
          detail:
            "Batches still being validated, staged, or reconciled downstream.",
          tone: "warning",
        },
        {
          label: "Failed or Rejected",
          value: String(summaryCounts[3]),
          detail:
            "Batches that encountered pre-validation, validation, or processing failures.",
          tone: "warning",
        },
      ],
      filters,
      locationOptions,
      rows: mappedRows,
      selectedBatch,
    };
  } catch (error) {
    console.error("Failed to load store uploads history", error);

    return {
      kind: "error",
      message:
        "We could not load store upload history right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function FilterBar({
  filters,
  locationOptions,
}: {
  filters: UploadFilters;
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
          Narrow store upload batches by month, processing status, or store
          location.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 lg:grid-cols-[0.8fr_1fr_1fr_auto]">
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
                  {formatBatchStatus(status)}
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
                <option
                  key={location.id}
                  value={location.id}
                  className="bg-slate-950 text-white"
                >
                  {location.name}
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
              <Link href="/store/uploads">Reset</Link>
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
          Upload history unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Store upload history could not be loaded
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

function EmptyState({
  context,
  filters,
  locationOptions,
  isAccessEmpty,
}: Extract<StoreUploadsPageState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.month || filters.status || filters.storeLocation,
  );

  return (
    <div className="space-y-6">
      {!isAccessEmpty ? (
        <FilterBar filters={filters} locationOptions={locationOptions} />
      ) : null}

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            {isAccessEmpty
              ? "No store upload assignments found"
              : "No store uploads found"}
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {isAccessEmpty
              ? "Your current account does not yet have any active store-side LP assignments."
              : hasFilters
                ? "No store upload batches match the current filters."
                : `No store upload batches have been recorded yet for ${context?.primaryStoreOrganizationName ?? "this store organization"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            asChild
            className="bg-white text-slate-950 hover:bg-slate-100"
          >
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

export default async function StoreUploadsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    status?: string;
    storeLocation?: string;
    batchId?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const state = await getStoreUploadsPageState(resolvedSearchParams);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            Store Uploads
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Store upload history
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Browse previous store-side import batches, review processing
              outcomes, and move directly into the related reconciliation cycle.
            </p>
          </div>
        </header>

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}

        {state.kind === "empty" ? (
          <EmptyState
            kind="empty"
            context={state.context}
            filters={state.filters}
            locationOptions={state.locationOptions}
            isAccessEmpty={state.isAccessEmpty}
          />
        ) : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Viewing uploads for{" "}
              <span className="font-medium text-white">
                {state.context.primaryStoreOrganizationName}
              </span>
              {state.context.totalStoreOrganizations > 1
                ? ` and ${state.context.totalStoreOrganizations - 1} more store organizations`
                : ""}
              . {state.context.totalLocations} active store
              {state.context.totalLocations === 1
                ? " location"
                : " locations"}{" "}
              are included in this scope.
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
              locationOptions={state.locationOptions}
            />

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Store upload batches
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real `ImportBatch` records scoped to your store organization
                  access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.rows.map((row) => (
                  <div
                    key={row.id}
                    className={`rounded-2xl border px-4 py-4 ${
                      row.id === state.selectedBatch?.id
                        ? "border-cyan-400/30 bg-cyan-400/10"
                        : "border-white/8 bg-slate-950/35"
                    }`}
                  >
                    <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr_1fr_1.2fr_0.9fr_0.9fr_0.8fr_0.7fr_0.7fr_auto] xl:items-start">
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
                        <div className="text-sm text-slate-300">
                          {row.lpName}
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
                          Original file name
                        </div>
                        <div className="text-sm text-slate-300">
                          {row.originalFileName}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          Uploaded by
                        </div>
                        <div className="text-sm text-slate-300">
                          {row.uploadedBy}
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
                          Status
                        </div>
                        <StatusBadge
                          label={formatBatchStatus(row.status)}
                          className={getBatchTone(row.status)}
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
                          Valid / invalid
                        </div>
                        <div className="text-sm text-slate-300">
                          {row.validRows ?? "N/A"} / {row.invalidRows ?? "N/A"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                        >
                          <Link
                            href={buildStoreUploadsHref(state.filters, row.id)}
                          >
                            View batch details
                          </Link>
                        </Button>
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="text-slate-300 hover:bg-white/5 hover:text-white"
                        >
                          <Link href={`/store/cycles/${row.cycleId}`}>
                            Go to related cycle
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled
                          className="text-slate-300 disabled:text-slate-500"
                        >
                          Reprocess
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {state.selectedBatch ? (
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Selected batch details
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Focused details for the currently selected store-side import
                    batch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  <DetailRow label="Batch ID" value={state.selectedBatch.id} />
                  <DetailRow
                    label="Original file"
                    value={state.selectedBatch.originalFileName}
                  />
                  <DetailRow label="LP" value={state.selectedBatch.lpName} />
                  <DetailRow
                    label="Store location"
                    value={state.selectedBatch.storeLocationName}
                  />
                  <DetailRow
                    label="Uploaded by"
                    value={state.selectedBatch.uploadedBy}
                  />
                  <DetailRow
                    label="Uploaded at"
                    value={formatDateTime(state.selectedBatch.uploadedAt)}
                  />
                  <DetailRow
                    label="Batch status"
                    value={
                      <StatusBadge
                        label={formatBatchStatus(state.selectedBatch.status)}
                        className={getBatchTone(state.selectedBatch.status)}
                      />
                    }
                  />
                  <DetailRow
                    label="Cycle status"
                    value={
                      <StatusBadge
                        label={formatCycleStatus(
                          state.selectedBatch.cycleStatus,
                        )}
                        className={getCycleTone(
                          state.selectedBatch.cycleStatus,
                        )}
                      />
                    }
                  />
                  <DetailRow
                    label="Current batch"
                    value={state.selectedBatch.isCurrent ? "Yes" : "No"}
                  />
                  <DetailRow
                    label="Rows"
                    value={`${state.selectedBatch.totalRows ?? "N/A"} total · ${state.selectedBatch.validRows ?? "N/A"} valid · ${state.selectedBatch.invalidRows ?? "N/A"} invalid`}
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
