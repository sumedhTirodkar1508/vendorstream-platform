import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type StatementStatus,
  type StatementTaskStatus,
} from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { retryStatementTaskAction } from "@/app/(withSidebar)/actions/retry-processing";
import { canRetryStatementTask } from "@/lib/processing-retry-rules";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SummaryItem = {
  label:
    | "Total Tasks"
    | "Pending Tasks"
    | "Completed Tasks"
    | "Failed Or Canceled";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type StatementTaskFilters = {
  status: string;
  month: string;
  taskId: string;
};

type StatementRow = {
  id: string;
  version: number;
  status: StatementStatus;
  generatedAt: Date | null;
};

type StatementTaskRow = {
  id: string;
  cycleId: string;
  month: Date;
  monthParam: string;
  lpName: string;
  storeOrganizationName: string;
  storeLocationName: string;
  status: StatementTaskStatus;
  attemptCount: number;
  requestedByName: string | null;
  requestedByEmail: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  statementCount: number;
  statements: StatementRow[];
};

type AdminStatementTasksState =
  | {
      kind: "ready";
      adminName: string;
      filters: StatementTaskFilters;
      summary: SummaryItem[];
      totalCount: number;
      matchingCount: number;
      monthOptions: string[];
      rows: StatementTaskRow[];
      selectedTask: StatementTaskRow | null;
    }
  | {
      kind: "empty";
      adminName: string;
      filters: StatementTaskFilters;
      summary: SummaryItem[];
      totalCount: number;
      matchingCount: number;
      monthOptions: string[];
    }
  | {
      kind: "error";
      message: string;
    };

const STATEMENT_TASK_STATUS_OPTIONS: StatementTaskStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELED",
];

const FAILED_OR_CANCELED_STATUSES: StatementTaskStatus[] = [
  "FAILED",
  "CANCELED",
];

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
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatMonthParam(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthParamLabel(value: string) {
  const [year, month] = value.split("-");
  const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return formatMonth(parsedDate);
}

function formatEnumLabel(value: string) {
  return value.replaceAll("_", " ");
}

function buildStatementTasksHref(filters: StatementTaskFilters) {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.month) {
    params.set("month", filters.month);
  }

  if (filters.taskId) {
    params.set("taskId", filters.taskId);
  }

  const query = params.toString();
  return query ? `/admin/statements/tasks?${query}` : "/admin/statements/tasks";
}

function getStatementTaskTone(status: StatementTaskStatus) {
  if (status === "COMPLETED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED" || status === "CANCELED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "PENDING" || status === "PROCESSING") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getStatementTone(status: StatementStatus) {
  if (status === "FINAL") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  return "border-amber-400/30 bg-amber-500/10 text-amber-100";
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

function EmptyListState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
      No {label.toLowerCase()} are currently available.
    </div>
  );
}

async function getAdminStatementTasksState(
  filters: StatementTaskFilters,
  adminName: string,
): Promise<AdminStatementTasksState> {
  try {
    const statusFilter = STATEMENT_TASK_STATUS_OPTIONS.includes(
      filters.status as StatementTaskStatus,
    )
      ? (filters.status as StatementTaskStatus)
      : undefined;

    const monthFilter = /^\d{4}-\d{2}$/.test(filters.month)
      ? filters.month
      : undefined;
    const monthDate = monthFilter
      ? new Date(`${monthFilter}-01T00:00:00.000Z`)
      : null;

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(monthDate
        ? {
            cycle: {
              periodMonth: monthDate,
            },
          }
        : {}),
    };

    const [
      totalCount,
      matchingCount,
      pendingCount,
      completedCount,
      failedOrCanceledCount,
      monthRows,
      rows,
    ] = await Promise.all([
      prisma.statementTask.count(),
      prisma.statementTask.count({ where }),
      prisma.statementTask.count({
        where: {
          status: "PENDING",
        },
      }),
      prisma.statementTask.count({
        where: {
          status: "COMPLETED",
        },
      }),
      prisma.statementTask.count({
        where: {
          status: {
            in: FAILED_OR_CANCELED_STATUSES,
          },
        },
      }),
      prisma.statementTask.findMany({
        select: {
          cycle: {
            select: {
              periodMonth: true,
            },
          },
        },
        orderBy: [{ cycle: { periodMonth: "desc" } }],
      }),
      prisma.statementTask.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: 50,
        select: {
          id: true,
          status: true,
          attemptCount: true,
          lastError: true,
          startedAt: true,
          completedAt: true,
          cycleId: true,
          cycle: {
            select: {
              periodMonth: true,
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
            },
          },
          requestedBy: {
            select: {
              name: true,
              email: true,
            },
          },
          statements: {
            orderBy: [{ version: "desc" }, { createdAt: "desc" }],
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

    const monthOptions = Array.from(
      new Set(monthRows.map((row) => formatMonthParam(row.cycle.periodMonth))),
    );

    const summary: SummaryItem[] = [
      {
        label: "Total Tasks",
        value: String(totalCount),
        detail: "All statement generation tasks recorded across VendorStream.",
        tone: "neutral",
      },
      {
        label: "Pending Tasks",
        value: String(pendingCount),
        detail:
          "Tasks still queued and waiting for a worker to start processing.",
        tone: pendingCount > 0 ? "warning" : "success",
      },
      {
        label: "Completed Tasks",
        value: String(completedCount),
        detail:
          "Tasks that completed and produced at least one statement artifact.",
        tone: "success",
      },
      {
        label: "Failed Or Canceled",
        value: String(failedOrCanceledCount),
        detail:
          "Tasks requiring intervention or re-run review before closeout.",
        tone: failedOrCanceledCount > 0 ? "warning" : "neutral",
      },
    ];

    if (rows.length === 0) {
      return {
        kind: "empty",
        adminName,
        filters,
        summary,
        totalCount,
        matchingCount,
        monthOptions,
      };
    }

    const mappedRows: StatementTaskRow[] = rows.map((row) => ({
      id: row.id,
      cycleId: row.cycleId,
      month: row.cycle.periodMonth,
      monthParam: formatMonthParam(row.cycle.periodMonth),
      lpName: row.cycle.lp.name,
      storeOrganizationName: row.cycle.storeLocation.storeOrganization.name,
      storeLocationName: row.cycle.storeLocation.name,
      status: row.status,
      attemptCount: row.attemptCount,
      requestedByName: row.requestedBy?.name ?? null,
      requestedByEmail: row.requestedBy?.email ?? null,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      lastError: row.lastError,
      statementCount: row.statements.length,
      statements: row.statements.map((statement) => ({
        id: statement.id,
        version: statement.version,
        status: statement.status,
        generatedAt: statement.generatedAt,
      })),
    }));

    const selectedTask =
      mappedRows.find((row) => row.id === filters.taskId) ??
      mappedRows[0] ??
      null;

    return {
      kind: "ready",
      adminName,
      filters,
      summary,
      totalCount,
      matchingCount,
      monthOptions,
      rows: mappedRows,
      selectedTask,
    };
  } catch (error) {
    console.error("Failed to load admin statement tasks", error);

    return {
      kind: "error",
      message:
        "We could not load statement task data right now. Try again shortly or contact VendorStream support if the issue persists.",
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
          Admin access is required
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          This statement task surface is limited to VendorStream platform
          administrators.
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
          Statement tasks unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Statement tasks could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/admin/dashboard">Back to admin dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  adminName,
  filters,
  summary,
  totalCount,
  matchingCount,
  monthOptions,
}: Extract<AdminStatementTasksState, { kind: "empty" }>) {
  const hasFilters = Boolean(filters.status || filters.month);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Reviewing statement tasks as{" "}
        <span className="font-medium text-white">{adminName}</span>. Showing{" "}
        <span className="font-medium text-white">{matchingCount}</span> matches
        across <span className="font-medium text-white">{totalCount}</span>{" "}
        total tasks.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <SummaryCard key={item.label} item={item} />
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg text-white">Filters</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Narrow statement tasks by task status or reconciliation month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 xl:grid-cols-[1fr_1fr_auto]">
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
                {STATEMENT_TASK_STATUS_OPTIONS.map((status) => (
                  <option
                    key={status}
                    value={status}
                    className="bg-slate-950 text-white"
                  >
                    {formatEnumLabel(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="month"
                className="text-sm font-medium text-slate-200"
              >
                Month
              </label>
              <select
                id="month"
                name="month"
                defaultValue={filters.month}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All months
                </option>
                {monthOptions.map((month) => (
                  <option
                    key={month}
                    value={month}
                    className="bg-slate-950 text-white"
                  >
                    {formatMonthParamLabel(month)}
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
                <Link
                  href={buildStatementTasksHref({
                    status: "",
                    month: "",
                    taskId: "",
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
          <CardTitle className="text-2xl text-white">
            No statement tasks found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No statement tasks match the current filter set."
              : "No statement tasks are currently available in this environment."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            asChild
            className="bg-white text-slate-950 hover:bg-slate-100"
          >
            <Link href="/admin/dashboard">Back to admin dashboard</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link
              href={buildStatementTasksHref({
                status: "",
                month: "",
                taskId: "",
              })}
            >
              Reset filters
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminStatementTasksPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    month?: string;
    taskId?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.systemRole !== "ADMIN") {
    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
          <header className="space-y-3">
            <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin Statement Tasks
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Statement task visibility
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: StatementTaskFilters = {
    status: resolvedSearchParams?.status?.trim() ?? "",
    month: resolvedSearchParams?.month?.trim() ?? "",
    taskId: resolvedSearchParams?.taskId?.trim() ?? "",
  };

  const adminName = session.user.name?.trim() || "VendorStream Admin";
  const state = await getAdminStatementTasksState(filters, adminName);
  const returnTo = buildStatementTasksHref(filters);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin Statement Tasks
            </div>
            <StatusBadge
              label="Admin"
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Statement task visibility
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review statement generation queue activity, inspect failures, and
              trace task output across reconciliation cycles.
            </p>
          </div>
          {"totalCount" in state ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Reviewing statement tasks as{" "}
              <span className="font-medium text-white">{state.adminName}</span>.
              Showing{" "}
              <span className="font-medium text-white">
                {state.matchingCount}
              </span>{" "}
              matches out of{" "}
              <span className="font-medium text-white">{state.totalCount}</span>{" "}
              total tasks.
            </div>
          ) : null}
        </header>

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? <EmptyState {...state} /> : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {state.summary.map((item) => (
                <SummaryCard key={item.label} item={item} />
              ))}
            </div>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg text-white">Filters</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Narrow statement tasks by task status or reconciliation month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 xl:grid-cols-[1fr_1fr_auto]">
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
                      defaultValue={state.filters.status}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All statuses
                      </option>
                      {STATEMENT_TASK_STATUS_OPTIONS.map((status) => (
                        <option
                          key={status}
                          value={status}
                          className="bg-slate-950 text-white"
                        >
                          {formatEnumLabel(status)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="month"
                      className="text-sm font-medium text-slate-200"
                    >
                      Month
                    </label>
                    <select
                      id="month"
                      name="month"
                      defaultValue={state.filters.month}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All months
                      </option>
                      {state.monthOptions.map((month) => (
                        <option
                          key={month}
                          value={month}
                          className="bg-slate-950 text-white"
                        >
                          {formatMonthParamLabel(month)}
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
                      <Link
                        href={buildStatementTasksHref({
                          status: "",
                          month: "",
                          taskId: "",
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
                <CardTitle className="text-xl text-white">
                  Statement tasks
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real `StatementTask` records with related cycle, requester,
                  and generated statement context.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="border-b border-white/8 bg-white/5">
                      <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-4 py-3 font-medium">Task ID</th>
                        <th className="px-4 py-3 font-medium">Month</th>
                        <th className="px-4 py-3 font-medium">LP</th>
                        <th className="px-4 py-3 font-medium">
                          Store location
                        </th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Attempt count</th>
                        <th className="px-4 py-3 font-medium">Requested by</th>
                        <th className="px-4 py-3 font-medium">Started at</th>
                        <th className="px-4 py-3 font-medium">Completed at</th>
                        <th className="px-4 py-3 font-medium">Last error</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-white/8 last:border-b-0 ${
                            row.id === state.selectedTask?.id
                              ? "bg-cyan-400/8"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-4 text-sm font-medium text-white">
                            <Link
                              href={buildStatementTasksHref({
                                status: state.filters.status,
                                month: state.filters.month,
                                taskId: row.id,
                              })}
                              className="hover:text-cyan-200"
                            >
                              {row.id}
                            </Link>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatMonth(row.month)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.lpName}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.storeLocationName}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={formatEnumLabel(row.status)}
                              className={getStatementTaskTone(row.status)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.attemptCount}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.requestedByName ??
                              row.requestedByEmail ??
                              "Unknown"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.startedAt)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.completedAt)}
                          </td>
                          <td className="max-w-[18rem] px-4 py-4 text-sm text-slate-300">
                            {row.lastError ?? "No error recorded"}
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                              >
                                <Link href={`/store/cycles/${row.cycleId}`}>
                                  View related cycle
                                </Link>
                              </Button>

                              {row.statements[0] ? (
                                <Button
                                  asChild
                                  size="sm"
                                  variant="outline"
                                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                >
                                  <Link
                                    href={`/store/statements/${row.statements[0].id}`}
                                  >
                                    View related statements
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
                                  View related statements
                                </Button>
                              )}

                              <form action={retryStatementTaskAction}>
                                <input
                                  type="hidden"
                                  name="statementTaskId"
                                  value={row.id}
                                />
                                <input
                                  type="hidden"
                                  name="returnTo"
                                  value={returnTo}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                  disabled={!canRetryStatementTask(row.status)}
                                  className="border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:text-slate-500"
                                >
                                  Retry
                                </Button>
                              </form>

                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled
                                className="text-slate-300 disabled:text-slate-500"
                              >
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {state.selectedTask ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Task details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Review statement generation timing, requester context, and
                      related output for the selected task.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow label="Task ID" value={state.selectedTask.id} />
                    <DetailRow
                      label="Month"
                      value={formatMonth(state.selectedTask.month)}
                    />
                    <DetailRow label="LP" value={state.selectedTask.lpName} />
                    <DetailRow
                      label="Store organization"
                      value={state.selectedTask.storeOrganizationName}
                    />
                    <DetailRow
                      label="Store location"
                      value={state.selectedTask.storeLocationName}
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusBadge
                          label={formatEnumLabel(state.selectedTask.status)}
                          className={getStatementTaskTone(
                            state.selectedTask.status,
                          )}
                        />
                      }
                    />
                    <DetailRow
                      label="Attempt count"
                      value={String(state.selectedTask.attemptCount)}
                    />
                    <DetailRow
                      label="Requested by"
                      value={
                        state.selectedTask.requestedByName ??
                        state.selectedTask.requestedByEmail ??
                        "Unknown"
                      }
                    />
                    <DetailRow
                      label="Started at"
                      value={formatDateTime(state.selectedTask.startedAt)}
                    />
                    <DetailRow
                      label="Completed at"
                      value={formatDateTime(state.selectedTask.completedAt)}
                    />
                    <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Last error
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-300">
                        {state.selectedTask.lastError ?? "No error recorded."}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Related statements
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Statements generated or attached to this task.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedTask.statements.length > 0 ? (
                        state.selectedTask.statements.map((statement) => (
                          <div
                            key={statement.id}
                            className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-white">
                                  Statement v{statement.version}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {statement.id}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Generated{" "}
                                  {formatDateTime(statement.generatedAt)}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <StatusBadge
                                  label={formatEnumLabel(statement.status)}
                                  className={getStatementTone(statement.status)}
                                />
                                <Button
                                  asChild
                                  size="sm"
                                  variant="outline"
                                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                >
                                  <Link
                                    href={`/store/statements/${statement.id}`}
                                  >
                                    Open statement
                                  </Link>
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyListState label="related statements" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Task actions
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Related-cycle and statement navigation is available now.
                        Retry and cancel flows can be connected when admin task
                        mutations are implemented.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        asChild
                        className="w-full bg-white text-slate-950 hover:bg-slate-100"
                      >
                        <Link
                          href={`/store/cycles/${state.selectedTask.cycleId}`}
                        >
                          View related cycle
                        </Link>
                      </Button>

                      {state.selectedTask.statements[0] ? (
                        <Button
                          asChild
                          variant="outline"
                          className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
                        >
                          <Link
                            href={`/store/statements/${state.selectedTask.statements[0].id}`}
                          >
                            View related statements
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          disabled
                          className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                        >
                          View related statements
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Retry task
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Cancel task
                      </Button>

                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: connect retry and cancel flows once the
                        corresponding admin statement-task mutation routes are
                        implemented.
                      </div>
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
