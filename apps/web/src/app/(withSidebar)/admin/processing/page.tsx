import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  type CycleStatus,
  type ImportBatchStatus,
  type StatementTaskStatus,
} from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  retryCycleReconciliationAction,
  retryImportBatchProcessingAction,
  retryStatementTaskAction,
} from "@/app/(withSidebar)/actions/retry-processing";
import { PageErrorState } from "@/components/page-error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatDateTime,
  formatEnumLabel,
  formatMonthLabel,
} from "@/lib/format";
import {
  type AdminProcessingMonitorFilters,
  getAdminProcessingMonitorData,
  type ProcessingCycleRow,
  type ProcessingStatementTaskRow,
} from "@/lib/admin-processing-monitor-server";
import {
  getCycleStatusBadgeClassName,
  getImportBatchStatusBadgeClassName,
} from "@/lib/status-badges";
import {
  canRetryCycle,
  canRetryImportBatch,
  canRetryStatementTask,
} from "@/lib/processing-retry-rules";

const FAILED_TASK_STATUSES: StatementTaskStatus[] = ["FAILED", "CANCELED"];

const IMPORT_BATCH_STATUS_OPTIONS: ImportBatchStatus[] = [
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

const CYCLE_STATUS_OPTIONS: CycleStatus[] = [
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

const STATEMENT_TASK_STATUS_OPTIONS: StatementTaskStatus[] = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELED",
];

function formatSourceType(value: "LP" | "STORE") {
  return value === "LP" ? "LP" : "Store";
}

function formatRowCount(value: number | null) {
  if (value === null) {
    return "N/A";
  }

  return value.toLocaleString("en-US");
}

function getStatementTaskStatusBadgeClassName(status: StatementTaskStatus) {
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

function toMonthParam(month: Date) {
  const year = month.getUTCFullYear();
  const monthValue = `${month.getUTCMonth() + 1}`.padStart(2, "0");
  return `${year}-${monthValue}`;
}

function formatMonthParamLabel(value: string) {
  const [year, month] = value.split("-");
  const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return formatMonthLabel(parsedDate);
}

function buildProcessingHref(filters: AdminProcessingMonitorFilters) {
  const params = new URLSearchParams();

  if (filters.month) {
    params.set("month", filters.month);
  }

  if (filters.batchStatus) {
    params.set("batchStatus", filters.batchStatus);
  }

  if (filters.cycleStatus) {
    params.set("cycleStatus", filters.cycleStatus);
  }

  if (filters.statementTaskStatus) {
    params.set("statementTaskStatus", filters.statementTaskStatus);
  }

  const query = params.toString();
  return query ? `/admin/processing?${query}` : "/admin/processing";
}

function buildStatementTasksHref({
  taskId,
  periodMonth,
}: {
  taskId?: string;
  periodMonth?: Date;
}) {
  const params = new URLSearchParams();

  if (taskId) {
    params.set("taskId", taskId);
  }

  if (periodMonth) {
    params.set("month", toMonthParam(periodMonth));
  }

  const query = params.toString();
  return query ? `/admin/statements/tasks?${query}` : "/admin/statements/tasks";
}

function CycleTaskCell({ cycle }: { cycle: ProcessingCycleRow }) {
  if (!cycle.statementTask) {
    return <span className="text-sm text-slate-400">Not requested</span>;
  }

  return (
    <div className="space-y-2">
      <StatusBadge
        label={formatEnumLabel(cycle.statementTask.status)}
        className={getStatementTaskStatusBadgeClassName(
          cycle.statementTask.status,
        )}
      />
      <div className="text-xs text-slate-400">
        Attempts: {cycle.statementTask.attemptCount}
      </div>
    </div>
  );
}

function TaskActionLinks({
  task,
  returnTo,
}: {
  task: ProcessingStatementTaskRow;
  returnTo: string;
}) {
  const statementTaskHref = buildStatementTasksHref({
    taskId: task.id,
    periodMonth: task.periodMonth,
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        asChild
        size="sm"
        variant="outline"
        className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10"
      >
        <Link href={`/lp/cycles/${task.cycleId}`}>Cycle detail</Link>
      </Button>
      <Button
        asChild
        size="sm"
        variant="outline"
        className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10"
      >
        <Link href={statementTaskHref}>Statement task</Link>
      </Button>
      <form action={retryStatementTaskAction}>
        <input type="hidden" name="statementTaskId" value={task.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!canRetryStatementTask(task.status)}
          className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:text-slate-500"
        >
          Retry task
        </Button>
      </form>
    </div>
  );
}

export default async function AdminProcessingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    month?: string;
    batchStatus?: string;
    cycleStatus?: string;
    statementTaskStatus?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.systemRole !== "ADMIN") {
    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 sm:px-8 lg:px-10">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Processing Monitor
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Operational monitoring for ingestion, reconciliation, and
              statement generation workflows.
            </p>
          </header>
          <PageErrorState
            variant="forbidden"
            title="Admin access is required"
            description="Only VendorStream administrators can access processing telemetry."
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
            }
          />
        </div>
      </main>
    );
  }

  try {
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const requestedFilters: AdminProcessingMonitorFilters = {
      month: resolvedSearchParams?.month?.trim() ?? "",
      batchStatus: resolvedSearchParams?.batchStatus?.trim() ?? "",
      cycleStatus: resolvedSearchParams?.cycleStatus?.trim() ?? "",
      statementTaskStatus:
        resolvedSearchParams?.statementTaskStatus?.trim() ?? "",
    };

    const data = await getAdminProcessingMonitorData(requestedFilters);
    const returnTo = buildProcessingHref(data.filters);
    const hasActiveFilters = Boolean(
      data.filters.month ||
      data.filters.batchStatus ||
      data.filters.cycleStatus ||
      data.filters.statementTaskStatus,
    );

    const failedBatchCount = data.recentBatches.filter(
      (batch) => batch.failedAt !== null || batch.lastError !== null,
    ).length;
    const mismatchHeavyCycleCount = data.recentCycles.filter(
      (cycle) => cycle.mismatchCount > 0,
    ).length;
    const failedTaskCount = data.recentStatementTasks.filter((task) =>
      FAILED_TASK_STATUSES.includes(task.status),
    ).length;

    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8 sm:px-8 lg:px-10">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
                Internal Operations
              </div>
              <StatusBadge
                label="Admin"
                className="border-white/10 bg-white/5 text-slate-200"
              />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Processing monitor
            </h1>
            <p className="max-w-4xl text-sm leading-7 text-slate-300 sm:text-base">
              Live operational visibility across import batches, reconciliation
              cycle transitions, and statement task execution.
            </p>
          </header>

          <Card className="border border-white/10 bg-white/6 backdrop-blur-xl">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg text-white">Filters</CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-300">
                Narrow operational records by month and status dimensions for
                triage.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
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
                    defaultValue={data.filters.month}
                    className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                  >
                    <option value="" className="bg-slate-950 text-white">
                      All months
                    </option>
                    {data.monthOptions.map((month) => (
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

                <div className="space-y-2">
                  <label
                    htmlFor="batchStatus"
                    className="text-sm font-medium text-slate-200"
                  >
                    Batch status
                  </label>
                  <select
                    id="batchStatus"
                    name="batchStatus"
                    defaultValue={data.filters.batchStatus}
                    className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                  >
                    <option value="" className="bg-slate-950 text-white">
                      All batch statuses
                    </option>
                    {IMPORT_BATCH_STATUS_OPTIONS.map((status) => (
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
                    htmlFor="cycleStatus"
                    className="text-sm font-medium text-slate-200"
                  >
                    Cycle status
                  </label>
                  <select
                    id="cycleStatus"
                    name="cycleStatus"
                    defaultValue={data.filters.cycleStatus}
                    className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                  >
                    <option value="" className="bg-slate-950 text-white">
                      All cycle statuses
                    </option>
                    {CYCLE_STATUS_OPTIONS.map((status) => (
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
                    htmlFor="statementTaskStatus"
                    className="text-sm font-medium text-slate-200"
                  >
                    Statement task status
                  </label>
                  <select
                    id="statementTaskStatus"
                    name="statementTaskStatus"
                    defaultValue={data.filters.statementTaskStatus}
                    className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                  >
                    <option value="" className="bg-slate-950 text-white">
                      All task statuses
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

                <div className="flex items-end gap-3">
                  <Button
                    type="submit"
                    className="bg-white text-slate-950 hover:bg-slate-100"
                  >
                    Apply
                  </Button>
                  <Button
                    asChild
                    type="button"
                    variant="outline"
                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Link
                      href={buildProcessingHref({
                        month: "",
                        batchStatus: "",
                        cycleStatus: "",
                        statementTaskStatus: "",
                      })}
                    >
                      Reset
                    </Link>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {hasActiveFilters ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Filters are active. Results below are scoped to the selected month
              and status criteria.
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-3">
            <Card className="border border-white/10 bg-white/6 backdrop-blur-xl">
              <CardHeader className="space-y-1">
                <CardDescription className="text-xs uppercase tracking-[0.16em] text-slate-300">
                  Recent batches
                </CardDescription>
                <CardTitle className="text-3xl text-white">
                  {data.recentBatches.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-300">
                {failedBatchCount} batches include a failure marker or recorded
                error.
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 backdrop-blur-xl">
              <CardHeader className="space-y-1">
                <CardDescription className="text-xs uppercase tracking-[0.16em] text-slate-300">
                  Recent cycles
                </CardDescription>
                <CardTitle className="text-3xl text-white">
                  {data.recentCycles.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-300">
                {mismatchHeavyCycleCount} cycles currently carry mismatches.
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 backdrop-blur-xl">
              <CardHeader className="space-y-1">
                <CardDescription className="text-xs uppercase tracking-[0.16em] text-slate-300">
                  Recent statement tasks
                </CardDescription>
                <CardTitle className="text-3xl text-white">
                  {data.recentStatementTasks.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-300">
                {failedTaskCount} tasks are in failed or canceled state.
              </CardContent>
            </Card>
          </section>

          <Card className="border border-white/10 bg-white/6 backdrop-blur-xl">
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Recent import batches
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Ingestion batches with processing outcomes and related cycle
                    state.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-white/8 bg-slate-950/35">
                <table className="min-w-full border-collapse text-left">
                  <thead className="border-b border-white/8 bg-white/5">
                    <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      <th className="px-4 py-3 font-medium">Batch</th>
                      <th className="px-4 py-3 font-medium">Source</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Rows (T/V/I)</th>
                      <th className="px-4 py-3 font-medium">Processed at</th>
                      <th className="px-4 py-3 font-medium">Failed at</th>
                      <th className="px-4 py-3 font-medium">Related cycle</th>
                      <th className="px-4 py-3 font-medium">Last error</th>
                      <th className="px-4 py-3 font-medium">Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentBatches.length === 0 ? (
                      <tr>
                        <td
                          className="px-4 py-6 text-sm text-slate-400"
                          colSpan={9}
                        >
                          No import batches match the current filters.
                        </td>
                      </tr>
                    ) : null}
                    {data.recentBatches.map((batch) => {
                      const cycleHref = `/lp/cycles/${batch.cycle.id}`;
                      const taskHref = buildStatementTasksHref({
                        periodMonth: batch.cycle.periodMonth,
                      });

                      return (
                        <tr
                          key={batch.id}
                          className="border-b border-white/8 last:border-b-0"
                        >
                          <td className="px-4 py-4 text-sm font-medium text-white">
                            <div className="space-y-1">
                              <div>{batch.id}</div>
                              <div className="text-xs text-slate-400">
                                {batch.fileName}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatSourceType(batch.sourceType)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={formatEnumLabel(batch.status)}
                              className={getImportBatchStatusBadgeClassName(
                                batch.status,
                              )}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatRowCount(batch.totalRows)} /{" "}
                            {formatRowCount(batch.validRows)} /{" "}
                            {formatRowCount(batch.invalidRows)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(batch.processedAt)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(batch.failedAt)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <div className="space-y-1">
                              <Link
                                href={cycleHref}
                                className="font-medium text-cyan-200 hover:text-cyan-100"
                              >
                                {formatMonthLabel(batch.cycle.periodMonth)}
                              </Link>
                              <div className="text-xs text-slate-400">
                                {batch.cycle.lpName} {" -> "}
                                {batch.cycle.storeOrganizationName} /{" "}
                                {batch.cycle.storeLocationName}
                              </div>
                            </div>
                          </td>
                          <td className="max-w-[20rem] px-4 py-4 text-sm text-slate-300">
                            {batch.lastError ?? "No error recorded"}
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10"
                              >
                                <Link href={`/lp/uploads/${batch.id}`}>
                                  Batch detail
                                </Link>
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10"
                              >
                                <Link href={cycleHref}>Cycle detail</Link>
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10"
                              >
                                <Link href={taskHref}>Statement tasks</Link>
                              </Button>
                              <form action={retryImportBatchProcessingAction}>
                                <input
                                  type="hidden"
                                  name="batchId"
                                  value={batch.id}
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
                                  disabled={!canRetryImportBatch(batch.status)}
                                  className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:text-slate-500"
                                >
                                  Retry batch
                                </Button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-white/6 backdrop-blur-xl">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl text-white">
                Recent reconciliation cycles
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-300">
                Cycle transition health with mismatch volume and latest
                statement task state.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-white/8 bg-slate-950/35">
                <table className="min-w-full border-collapse text-left">
                  <thead className="border-b border-white/8 bg-white/5">
                    <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      <th className="px-4 py-3 font-medium">Cycle</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Mismatch count</th>
                      <th className="px-4 py-3 font-medium">
                        Statement task state
                      </th>
                      <th className="px-4 py-3 font-medium">Updated at</th>
                      <th className="px-4 py-3 font-medium">Last error</th>
                      <th className="px-4 py-3 font-medium">Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentCycles.length === 0 ? (
                      <tr>
                        <td
                          className="px-4 py-6 text-sm text-slate-400"
                          colSpan={7}
                        >
                          No reconciliation cycles match the current filters.
                        </td>
                      </tr>
                    ) : null}
                    {data.recentCycles.map((cycle) => {
                      const cycleHref = `/lp/cycles/${cycle.id}`;
                      const statementTaskHref = buildStatementTasksHref({
                        taskId: cycle.statementTask?.id,
                        periodMonth: cycle.periodMonth,
                      });

                      return (
                        <tr
                          key={cycle.id}
                          className="border-b border-white/8 last:border-b-0"
                        >
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <div className="space-y-1">
                              <Link
                                href={cycleHref}
                                className="font-medium text-cyan-200 hover:text-cyan-100"
                              >
                                {formatMonthLabel(cycle.periodMonth)}
                              </Link>
                              <div className="text-xs text-slate-400">
                                {cycle.lpName} {" -> "}
                                {cycle.storeOrganizationName} /{" "}
                                {cycle.storeLocationName}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={formatEnumLabel(cycle.status)}
                              className={getCycleStatusBadgeClassName(
                                cycle.status,
                              )}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {cycle.mismatchCount.toLocaleString("en-US")}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <CycleTaskCell cycle={cycle} />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(cycle.updatedAt)}
                          </td>
                          <td className="max-w-[20rem] px-4 py-4 text-sm text-slate-300">
                            {cycle.lastError ??
                              cycle.statementTask?.lastError ??
                              "No error recorded"}
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10"
                              >
                                <Link href={cycleHref}>Cycle detail</Link>
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10"
                              >
                                <Link href={statementTaskHref}>
                                  Statement tasks
                                </Link>
                              </Button>
                              <form action={retryCycleReconciliationAction}>
                                <input
                                  type="hidden"
                                  name="cycleId"
                                  value={cycle.id}
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
                                  disabled={!canRetryCycle(cycle.status)}
                                  className="h-8 border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:text-slate-500"
                                >
                                  Retry cycle
                                </Button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/10 bg-white/6 backdrop-blur-xl">
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Recent statement tasks
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Task queue state with retry attempts and latest execution
                    errors.
                  </CardDescription>
                </div>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                >
                  <Link href="/admin/statements/tasks">Open task explorer</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-white/8 bg-slate-950/35">
                <table className="min-w-full border-collapse text-left">
                  <thead className="border-b border-white/8 bg-white/5">
                    <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      <th className="px-4 py-3 font-medium">Task</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Attempts</th>
                      <th className="px-4 py-3 font-medium">Cycle</th>
                      <th className="px-4 py-3 font-medium">Started at</th>
                      <th className="px-4 py-3 font-medium">Completed at</th>
                      <th className="px-4 py-3 font-medium">Last error</th>
                      <th className="px-4 py-3 font-medium">Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentStatementTasks.length === 0 ? (
                      <tr>
                        <td
                          className="px-4 py-6 text-sm text-slate-400"
                          colSpan={8}
                        >
                          No statement tasks match the current filters.
                        </td>
                      </tr>
                    ) : null}
                    {data.recentStatementTasks.map((task) => (
                      <tr
                        key={task.id}
                        className="border-b border-white/8 last:border-b-0"
                      >
                        <td className="px-4 py-4 text-sm font-medium text-white">
                          {task.id}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">
                          <StatusBadge
                            label={formatEnumLabel(task.status)}
                            className={getStatementTaskStatusBadgeClassName(
                              task.status,
                            )}
                          />
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">
                          {task.attemptCount}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">
                          <div className="space-y-1">
                            <div>{formatMonthLabel(task.periodMonth)}</div>
                            <div className="text-xs text-slate-400">
                              {task.lpName} {" -> "}
                              {task.storeOrganizationName} /{" "}
                              {task.storeLocationName}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">
                          {formatDateTime(task.startedAt)}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">
                          {formatDateTime(task.completedAt)}
                        </td>
                        <td className="max-w-[20rem] px-4 py-4 text-sm text-slate-300">
                          {task.lastError ?? "No error recorded"}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <TaskActionLinks task={task} returnTo={returnTo} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  } catch (error) {
    console.error("Failed to load admin processing monitor", error);

    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 sm:px-8 lg:px-10">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Processing Monitor
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Operational monitoring for ingestion, reconciliation, and
              statement generation workflows.
            </p>
          </header>
          <PageErrorState
            variant="error"
            title="Processing data could not be loaded"
            description="Try again shortly. If the issue persists, review worker logs and database connectivity."
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/admin/dashboard">Back to admin dashboard</Link>
              </Button>
            }
          />
        </div>
      </main>
    );
  }
}
