import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  Prisma,
  type AuditActorType,
  type ImportBatchStatus,
  type BatchSourceType,
  type CycleStatus,
} from "@vendorstream/database";
import { ClipboardList } from "lucide-react";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { EmptyState as AppEmptyState } from "@/components/empty-state";
import { formatMonthLabel } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type AuditFilters = {
  entityType: string;
  actorType: string;
  createdFrom: string;
  createdTo: string;
  logId: string;
};

type AuditLogRow = {
  id: string;
  createdAt: Date;
  actorType: AuditActorType;
  actorName: string | null;
  actorEmail: string | null;
  actorSystemRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  cycleId: string | null;
  batchId: string | null;
  metadata: Prisma.JsonValue | null;
  cycle:
    | {
        id: string;
        periodMonth: Date;
        status: CycleStatus;
        lpName: string;
        storeLocationName: string;
      }
    | null;
  batch:
    | {
        id: string;
        sourceType: BatchSourceType;
        status: ImportBatchStatus;
        originalFilename: string;
        cycleId: string;
      }
    | null;
};

type AuditState =
  | {
      kind: "ready";
      viewerLabel: string;
      canOpenLinkedRecords: boolean;
      filters: AuditFilters;
      totalCount: number;
      matchingCount: number;
      entityTypeOptions: string[];
      rows: AuditLogRow[];
      selectedLog: AuditLogRow | null;
    }
  | {
      kind: "empty";
      viewerLabel: string;
      canOpenLinkedRecords: boolean;
      filters: AuditFilters;
      totalCount: number;
      matchingCount: number;
      entityTypeOptions: string[];
    }
  | {
      kind: "error";
      message: string;
    };

const ACTOR_TYPE_OPTIONS: AuditActorType[] = ["USER", "SYSTEM"];

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

function formatMonth(date: Date) {
  return formatMonthLabel(date);
}

function formatEnumLabel(value: string) {
  return value.replaceAll("_", " ");
}

function buildAuditHref(filters: AuditFilters) {
  const params = new URLSearchParams();

  if (filters.entityType) {
    params.set("entityType", filters.entityType);
  }

  if (filters.actorType) {
    params.set("actorType", filters.actorType);
  }

  if (filters.createdFrom) {
    params.set("createdFrom", filters.createdFrom);
  }

  if (filters.createdTo) {
    params.set("createdTo", filters.createdTo);
  }

  if (filters.logId) {
    params.set("logId", filters.logId);
  }

  const query = params.toString();
  return query ? `/audit?${query}` : "/audit";
}

function getActorTypeTone(actorType: AuditActorType) {
  if (actorType === "USER") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
  }

  return "border-amber-400/30 bg-amber-500/10 text-amber-100";
}

function getCycleStatusTone(status: CycleStatus) {
  if (status === "STATEMENT_READY" || status === "RECONCILIATION_PASSED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (
    status === "AWAITING_UPLOADS" ||
    status === "MISMATCHES_FOUND" ||
    status === "STATEMENT_PENDING" ||
    status === "STATEMENT_GENERATING"
  ) {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getBatchStatusTone(status: ImportBatchStatus) {
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
    status === "STAGED" ||
    status === "WAITING_FOR_COUNTERPART" ||
    status === "READY_FOR_RECONCILIATION" ||
    status === "RECONCILING"
  ) {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function formatMetadata(metadata: Prisma.JsonValue | null) {
  if (metadata === null) {
    return "No metadata recorded.";
  }

  return JSON.stringify(metadata, null, 2);
}

function getActorLabel(log: AuditLogRow) {
  if (log.actorType === "SYSTEM") {
    return "VendorStream System";
  }

  return log.actorName ?? log.actorEmail ?? "Unknown user";
}

function getBatchHref(batch: NonNullable<AuditLogRow["batch"]>) {
  if (batch.sourceType === "LP") {
    return `/lp/uploads/${batch.id}`;
  }

  return `/store/uploads?batchId=${batch.id}`;
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

async function getAuditState({
  viewerLabel,
  filters,
  canOpenLinkedRecords,
}: {
  viewerLabel: string;
  filters: AuditFilters;
  canOpenLinkedRecords: boolean;
}): Promise<AuditState> {
  try {
    const actorTypeFilter = ACTOR_TYPE_OPTIONS.includes(
      filters.actorType as AuditActorType,
    )
      ? (filters.actorType as AuditActorType)
      : undefined;

    const createdFromDate = /^\d{4}-\d{2}-\d{2}$/.test(filters.createdFrom)
      ? new Date(`${filters.createdFrom}T00:00:00.000Z`)
      : null;
    const createdToDate = /^\d{4}-\d{2}-\d{2}$/.test(filters.createdTo)
      ? new Date(`${filters.createdTo}T00:00:00.000Z`)
      : null;
    const createdToExclusive = createdToDate
      ? new Date(createdToDate.getTime() + 24 * 60 * 60 * 1000)
      : null;

    const where: Prisma.AuditLogWhereInput = {
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(actorTypeFilter ? { actorType: actorTypeFilter } : {}),
      ...((createdFromDate || createdToExclusive)
        ? {
            createdAt: {
              ...(createdFromDate ? { gte: createdFromDate } : {}),
              ...(createdToExclusive ? { lt: createdToExclusive } : {}),
            },
          }
        : {}),
    };

    const [totalCount, matchingCount, entityTypeRows, rows] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        distinct: ["entityType"],
        orderBy: [{ entityType: "asc" }],
        select: {
          entityType: true,
        },
      }),
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          createdAt: true,
          actorType: true,
          action: true,
          entityType: true,
          entityId: true,
          cycleId: true,
          batchId: true,
          metadata: true,
          actor: {
            select: {
              name: true,
              email: true,
              systemRole: true,
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
                  name: true,
                },
              },
            },
          },
          batch: {
            select: {
              id: true,
              sourceType: true,
              status: true,
              cycleId: true,
              uploadedFile: {
                select: {
                  originalFilename: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const entityTypeOptions = entityTypeRows.map((row) => row.entityType);

    if (rows.length === 0) {
      return {
        kind: "empty",
        viewerLabel,
        canOpenLinkedRecords,
        filters,
        totalCount,
        matchingCount,
        entityTypeOptions,
      };
    }

    const mappedRows: AuditLogRow[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      actorType: row.actorType,
      actorName: row.actor?.name ?? null,
      actorEmail: row.actor?.email ?? null,
      actorSystemRole: row.actor?.systemRole ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      cycleId: row.cycleId,
      batchId: row.batchId,
      metadata: row.metadata,
      cycle: row.cycle
        ? {
            id: row.cycle.id,
            periodMonth: row.cycle.periodMonth,
            status: row.cycle.status,
            lpName: row.cycle.lp.name,
            storeLocationName: row.cycle.storeLocation.name,
          }
        : null,
      batch: row.batch
        ? {
            id: row.batch.id,
            sourceType: row.batch.sourceType,
            status: row.batch.status,
            originalFilename: row.batch.uploadedFile.originalFilename,
            cycleId: row.batch.cycleId,
          }
        : null,
    }));

    const selectedLog =
      mappedRows.find((row) => row.id === filters.logId) ?? mappedRows[0] ?? null;

    return {
      kind: "ready",
      viewerLabel,
      canOpenLinkedRecords,
      filters,
      totalCount,
      matchingCount,
      entityTypeOptions,
      rows: mappedRows,
      selectedLog,
    };
  } catch (error) {
    console.error("Failed to load audit logs", error);

    return {
      kind: "error",
      message:
        "We could not load audit activity right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function ForbiddenState() {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Access restricted
        </div>
        <CardTitle className="text-2xl text-white">
          Internal audit access is required
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          This audit trail is limited to internal VendorStream operations roles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Audit unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Audit trail could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  viewerLabel,
  filters,
  totalCount,
  matchingCount,
  entityTypeOptions,
}: Extract<AuditState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.entityType ||
      filters.actorType ||
      filters.createdFrom ||
      filters.createdTo,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Reviewing audit activity as{" "}
        <span className="font-medium text-white">{viewerLabel}</span>. Showing{" "}
        <span className="font-medium text-white">{matchingCount}</span> matches
        across <span className="font-medium text-white">{totalCount}</span> total
        audit records.
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg text-white">Filters</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Narrow audit activity by entity type, actor type, or created date
            range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <label
                htmlFor="entityType"
                className="text-sm font-medium text-slate-200"
              >
                Entity type
              </label>
              <select
                id="entityType"
                name="entityType"
                defaultValue={filters.entityType}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All entities
                </option>
                {entityTypeOptions.map((entityType) => (
                  <option
                    key={entityType}
                    value={entityType}
                    className="bg-slate-950 text-white"
                  >
                    {entityType}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="actorType"
                className="text-sm font-medium text-slate-200"
              >
                Actor type
              </label>
              <select
                id="actorType"
                name="actorType"
                defaultValue={filters.actorType}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All actor types
                </option>
                {ACTOR_TYPE_OPTIONS.map((actorType) => (
                  <option
                    key={actorType}
                    value={actorType}
                    className="bg-slate-950 text-white"
                  >
                    {formatEnumLabel(actorType)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="createdFrom"
                className="text-sm font-medium text-slate-200"
              >
                From date
              </label>
              <input
                id="createdFrom"
                name="createdFrom"
                type="date"
                defaultValue={filters.createdFrom}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="createdTo"
                className="text-sm font-medium text-slate-200"
              >
                To date
              </label>
              <input
                id="createdTo"
                name="createdTo"
                type="date"
                defaultValue={filters.createdTo}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              />
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
                <Link
                  href={buildAuditHref({
                    entityType: "",
                    actorType: "",
                    createdFrom: "",
                    createdTo: "",
                    logId: "",
                  })}
                >
                  Reset
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AppEmptyState
        icon={<ClipboardList className="h-5 w-5" />}
        title="No audit records found"
        description={
          hasFilters
            ? "No audit records match the current filter set."
            : "No audit records are currently available in this environment."
        }
        actions={
          <>
            <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <Link
                href={buildAuditHref({
                  entityType: "",
                  actorType: "",
                  createdFrom: "",
                  createdTo: "",
                  logId: "",
                })}
              >
                Reset filters
              </Link>
            </Button>
          </>
        }
      />
    </div>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<{
    entityType?: string;
    actorType?: string;
    createdFrom?: string;
    createdTo?: string;
    logId?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const isInternalViewer =
    session.user.systemRole === "ADMIN" ||
    session.user.systemRole === "FINANCE_VIEWER";

  if (!isInternalViewer) {
    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
          <header className="space-y-3">
            <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Audit
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Internal audit trail
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: AuditFilters = {
    entityType: resolvedSearchParams?.entityType?.trim() ?? "",
    actorType: resolvedSearchParams?.actorType?.trim() ?? "",
    createdFrom: resolvedSearchParams?.createdFrom?.trim() ?? "",
    createdTo: resolvedSearchParams?.createdTo?.trim() ?? "",
    logId: resolvedSearchParams?.logId?.trim() ?? "",
  };

  const viewerLabel = session.user.name?.trim() || "VendorStream Internal User";
  const canOpenLinkedRecords = session.user.systemRole === "ADMIN";
  const state = await getAuditState({
    viewerLabel,
    filters,
    canOpenLinkedRecords,
  });

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Audit
            </div>
            <StatusBadge
              label={
                session.user.systemRole === "ADMIN"
                  ? "Admin"
                  : "Finance Viewer"
              }
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Internal audit trail
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review user and system activity across operational entities,
              reconciliation cycles, and import batches.
            </p>
          </div>
          {"totalCount" in state ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Reviewing audit activity as{" "}
              <span className="font-medium text-white">{state.viewerLabel}</span>.
              Showing{" "}
              <span className="font-medium text-white">{state.matchingCount}</span>{" "}
              matches out of{" "}
              <span className="font-medium text-white">{state.totalCount}</span>{" "}
              total audit records.
            </div>
          ) : null}
          {"canOpenLinkedRecords" in state && !state.canOpenLinkedRecords ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
              Linked cycle and batch drill-down is disabled for finance-viewer
              sessions because downstream operational routes are currently admin
              scoped.
            </div>
          ) : null}
        </header>

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? <EmptyState {...state} /> : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg text-white">Filters</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Narrow audit activity by entity type, actor type, or created
                  date range.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <div className="space-y-2">
                    <label
                      htmlFor="entityType"
                      className="text-sm font-medium text-slate-200"
                    >
                      Entity type
                    </label>
                    <select
                      id="entityType"
                      name="entityType"
                      defaultValue={state.filters.entityType}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All entities
                      </option>
                      {state.entityTypeOptions.map((entityType) => (
                        <option
                          key={entityType}
                          value={entityType}
                          className="bg-slate-950 text-white"
                        >
                          {entityType}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="actorType"
                      className="text-sm font-medium text-slate-200"
                    >
                      Actor type
                    </label>
                    <select
                      id="actorType"
                      name="actorType"
                      defaultValue={state.filters.actorType}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All actor types
                      </option>
                      {ACTOR_TYPE_OPTIONS.map((actorType) => (
                        <option
                          key={actorType}
                          value={actorType}
                          className="bg-slate-950 text-white"
                        >
                          {formatEnumLabel(actorType)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="createdFrom"
                      className="text-sm font-medium text-slate-200"
                    >
                      From date
                    </label>
                    <input
                      id="createdFrom"
                      name="createdFrom"
                      type="date"
                      defaultValue={state.filters.createdFrom}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="createdTo"
                      className="text-sm font-medium text-slate-200"
                    >
                      To date
                    </label>
                    <input
                      id="createdTo"
                      name="createdTo"
                      type="date"
                      defaultValue={state.filters.createdTo}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    />
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
                      <Link
                        href={buildAuditHref({
                          entityType: "",
                          actorType: "",
                          createdFrom: "",
                          createdTo: "",
                          logId: "",
                        })}
                      >
                        Reset
                      </Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">Audit log</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real `AuditLog` records with related actor, cycle, and batch
                  references where available.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="border-b border-white/8 bg-white/5">
                      <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-4 py-3 font-medium">Created at</th>
                        <th className="px-4 py-3 font-medium">Actor type</th>
                        <th className="px-4 py-3 font-medium">Actor</th>
                        <th className="px-4 py-3 font-medium">Action</th>
                        <th className="px-4 py-3 font-medium">Entity type</th>
                        <th className="px-4 py-3 font-medium">Entity ID</th>
                        <th className="px-4 py-3 font-medium">Cycle ID</th>
                        <th className="px-4 py-3 font-medium">Batch ID</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-white/8 last:border-b-0 ${
                            row.id === state.selectedLog?.id ? "bg-cyan-400/8" : ""
                          }`}
                        >
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.createdAt)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={formatEnumLabel(row.actorType)}
                              className={getActorTypeTone(row.actorType)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {getActorLabel(row)}
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-white">
                            {row.action}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.entityType}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.entityId}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.cycleId ?? "Not linked"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.batchId ?? "Not linked"}
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                              >
                                <Link
                                  href={buildAuditHref({
                                    entityType: state.filters.entityType,
                                    actorType: state.filters.actorType,
                                    createdFrom: state.filters.createdFrom,
                                    createdTo: state.filters.createdTo,
                                    logId: row.id,
                                  })}
                                >
                                  View details
                                </Link>
                              </Button>

                              {canOpenLinkedRecords && row.cycleId ? (
                                <Button
                                  asChild
                                  size="sm"
                                  variant="outline"
                                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                >
                                  <Link href={`/store/cycles/${row.cycleId}`}>
                                    Go to related cycle
                                  </Link>
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled
                                  className="border-white/15 bg-white/5 text-white disabled:text-slate-500"
                                >
                                  Go to related cycle
                                </Button>
                              )}

                              {canOpenLinkedRecords && row.batch ? (
                                <Button
                                  asChild
                                  size="sm"
                                  variant="outline"
                                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                >
                                  <Link href={getBatchHref(row.batch)}>
                                    Go to related batch
                                  </Link>
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled
                                  className="border-white/15 bg-white/5 text-white disabled:text-slate-500"
                                >
                                  Go to related batch
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {state.selectedLog ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Audit entry details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Review actor identity, entity linkage, and operational
                      metadata for the selected audit record.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow label="Log ID" value={state.selectedLog.id} />
                    <DetailRow
                      label="Created at"
                      value={formatDateTime(state.selectedLog.createdAt)}
                    />
                    <DetailRow
                      label="Actor type"
                      value={
                        <StatusBadge
                          label={formatEnumLabel(state.selectedLog.actorType)}
                          className={getActorTypeTone(state.selectedLog.actorType)}
                        />
                      }
                    />
                    <DetailRow
                      label="Actor"
                      value={getActorLabel(state.selectedLog)}
                    />
                    <DetailRow
                      label="Actor email"
                      value={state.selectedLog.actorEmail ?? "Not available"}
                    />
                    <DetailRow
                      label="Actor system role"
                      value={
                        state.selectedLog.actorSystemRole
                          ? formatEnumLabel(state.selectedLog.actorSystemRole)
                          : "Not available"
                      }
                    />
                    <DetailRow label="Action" value={state.selectedLog.action} />
                    <DetailRow
                      label="Entity type"
                      value={state.selectedLog.entityType}
                    />
                    <DetailRow
                      label="Entity ID"
                      value={state.selectedLog.entityId}
                    />
                    <DetailRow
                      label="Cycle ID"
                      value={state.selectedLog.cycleId ?? "Not linked"}
                    />
                    <DetailRow
                      label="Batch ID"
                      value={state.selectedLog.batchId ?? "Not linked"}
                    />
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Related records
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Linked cycle and batch context when the audit entry is
                        attached to downstream operational records.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedLog.cycle ? (
                        <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-white">
                                Cycle {formatMonth(state.selectedLog.cycle.periodMonth)}
                              </div>
                              <div className="text-xs text-slate-500">
                                {state.selectedLog.cycle.id}
                              </div>
                              <div className="text-xs text-slate-500">
                                {state.selectedLog.cycle.lpName} ·{" "}
                                {state.selectedLog.cycle.storeLocationName}
                              </div>
                            </div>
                            <StatusBadge
                              label={formatEnumLabel(state.selectedLog.cycle.status)}
                              className={getCycleStatusTone(
                                state.selectedLog.cycle.status,
                              )}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                          No related cycle is attached to this audit record.
                        </div>
                      )}

                      {state.selectedLog.batch ? (
                        <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm font-medium text-white">
                                {state.selectedLog.batch.originalFilename}
                              </div>
                              <div className="text-xs text-slate-500">
                                {state.selectedLog.batch.id}
                              </div>
                              <div className="text-xs text-slate-500">
                                {formatEnumLabel(state.selectedLog.batch.sourceType)}{" "}
                                batch
                              </div>
                            </div>
                            <StatusBadge
                              label={formatEnumLabel(state.selectedLog.batch.status)}
                              className={getBatchStatusTone(
                                state.selectedLog.batch.status,
                              )}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                          No related import batch is attached to this audit record.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Metadata
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Raw metadata captured when VendorStream recorded this audit
                        event.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <pre className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4 text-xs leading-6 text-slate-300">
                        {formatMetadata(state.selectedLog.metadata)}
                      </pre>

                      {!state.canOpenLinkedRecords ? (
                        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                          TODO: expose read-only cycle and batch drill-down routes
                          for finance-viewer sessions if those links should be
                          available outside admin contexts.
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
