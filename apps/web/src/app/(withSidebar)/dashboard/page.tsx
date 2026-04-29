import Link from "next/link";
import { redirect } from "next/navigation";
import {
  prisma,
  type CycleStatus,
  type ImportBatchStatus,
  type StatementStatus,
} from "@vendorstream/database";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAccessSnapshot, type AccessSnapshot } from "@/lib/authz";
import { formatMonthLabel } from "@/lib/format";

type DashboardSummary = {
  label:
    | "Active Cycles"
    | "Pending Uploads"
    | "Open Mismatches"
    | "Ready Statements";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type RecentCycleRow = {
  id: string;
  monthLabel: string;
  lpName: string;
  storeLocation: string;
  cycleStatus: CycleStatus;
  mismatchCount: number;
  statementStatus: "NOT_READY" | "DRAFT" | "READY" | "FAILED";
};

type LpDashboardState =
  | {
      kind: "ready";
      userName: string;
      lpLabel: string;
      summary: DashboardSummary[];
      recentCycles: RecentCycleRow[];
    }
  | {
      kind: "empty";
      userName: string;
      lpLabel: string;
      noWorkspaceAccess: boolean;
    }
  | {
      kind: "error";
      userName: string;
      message: string;
    };

const ACTIVE_CYCLE_STATUSES: CycleStatus[] = [
  "AWAITING_UPLOADS",
  "PROCESSING",
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
  "MISMATCHES_FOUND",
  "STATEMENT_PENDING",
  "STATEMENT_GENERATING",
];

const LP_UPLOAD_ATTENTION_STATUSES: ImportBatchStatus[] = [
  "RECEIVED",
  "PREVALIDATION_FAILED",
  "VALIDATING",
  "VALIDATION_FAILED",
  "WAITING_FOR_COUNTERPART",
  "FAILED",
  "CANCELED",
];

function formatMonth(date: Date) {
  return formatMonthLabel(date);
}

function getRoleLabel(role?: "USER" | "ADMIN" | "FINANCE_VIEWER") {
  if (role === "ADMIN") {
    return "Admin";
  }

  if (role === "FINANCE_VIEWER") {
    return "Finance Viewer";
  }

  return "LP Workspace";
}

function getStatementTone(status: RecentCycleRow["statementStatus"]) {
  if (status === "READY") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "DRAFT") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function mapStatementStatus(
  status: StatementStatus | undefined,
): RecentCycleRow["statementStatus"] {
  if (status === "FINAL") {
    return "READY";
  }

  if (status === "FAILED") {
    return "FAILED";
  }

  if (status === "DRAFT") {
    return "DRAFT";
  }

  return "NOT_READY";
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "warning" | "success";
}) {
  const styles =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
        : "border-white/10 bg-white/5 text-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}
    >
      {label}
    </span>
  );
}

function SummaryCard({ item }: { item: DashboardSummary }) {
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

function QuickActionCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base text-white">{title}</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          asChild
          variant="outline"
          className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          <Link href={href}>{title}</Link>
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
          Dashboard unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Dashboard data could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/cycles">Open reconciliation cycles</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          <Link href="/lp/statements">Open statements</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  lpLabel,
  noWorkspaceAccess,
}: Extract<LpDashboardState, { kind: "empty" }>) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-white">
          {noWorkspaceAccess
            ? "No LP workspace access"
            : "No LP activity yet"}
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {noWorkspaceAccess
            ? "This account does not have an LP workspace assignment yet. If you expected LP access, ask a VendorStream admin to review your memberships."
            : `As uploads, reconciliation cycles, and statements are created for ${lpLabel}, the most important operational items will appear here.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/uploads">Open upload history</Link>
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

function getDashboardRedirectTarget(access: AccessSnapshot) {
  if (access.hasAdminAccess) {
    return "/admin/dashboard";
  }

  if (!access.hasLpAccess) {
    if (access.hasStoreAccess) {
      return "/store/dashboard";
    }

    if (access.hasOperationsAccess) {
      return "/audit";
    }
  }

  return null;
}

async function getDashboardState(access: AccessSnapshot): Promise<LpDashboardState> {
  const userName = access.user.name;
  const lpContext = access.lpContext;

  try {
    if (lpContext.lpIds.length === 0) {
      return {
        kind: "empty",
        userName,
        lpLabel: "LP workspace",
        noWorkspaceAccess: true,
      };
    }

    const [activeCycles, pendingUploads, openMismatches, readyStatements, recentCycles] =
      await Promise.all([
        prisma.reconciliationCycle.count({
          where: {
            lpId: {
              in: lpContext.lpIds,
            },
            status: {
              in: ACTIVE_CYCLE_STATUSES,
            },
          },
        }),
        prisma.reconciliationCycle.count({
          where: {
            lpId: {
              in: lpContext.lpIds,
            },
            OR: [
              {
                status: "AWAITING_UPLOADS",
              },
              {
                importBatches: {
                  none: {
                    sourceType: "LP",
                    isCurrent: true,
                  },
                },
              },
              {
                importBatches: {
                  some: {
                    sourceType: "LP",
                    isCurrent: true,
                    status: {
                      in: LP_UPLOAD_ATTENTION_STATUSES,
                    },
                  },
                },
              },
            ],
          },
        }),
        prisma.mismatch.count({
          where: {
            cycle: {
              lpId: {
                in: lpContext.lpIds,
              },
            },
            status: "OPEN",
          },
        }),
        prisma.statement.count({
          where: {
            cycle: {
              lpId: {
                in: lpContext.lpIds,
              },
            },
            status: "FINAL",
          },
        }),
        prisma.reconciliationCycle.findMany({
          where: {
            lpId: {
              in: lpContext.lpIds,
            },
          },
          orderBy: [{ updatedAt: "desc" }, { periodMonth: "desc" }],
          take: 6,
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
            mismatches: {
              where: {
                status: "OPEN",
              },
              select: {
                id: true,
              },
            },
            statements: {
              orderBy: [{ version: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: {
                status: true,
              },
            },
          },
        }),
      ]);

    if (recentCycles.length === 0) {
      return {
        kind: "empty",
        userName,
        lpLabel: lpContext.displayName,
        noWorkspaceAccess: false,
      };
    }

    return {
      kind: "ready",
      userName,
      lpLabel: lpContext.displayName,
      summary: [
        {
          label: "Active Cycles",
          value: String(activeCycles),
          detail: "Open reconciliation cycles currently progressing through upload, matching, or statement preparation.",
          tone: "neutral",
        },
        {
          label: "Pending Uploads",
          value: String(pendingUploads),
          detail: "Cycles still waiting on an LP upload or needing LP-side upload attention before reconciliation can progress.",
          tone: "warning",
        },
        {
          label: "Open Mismatches",
          value: String(openMismatches),
          detail: "Outstanding row-level issues still requiring review before downstream finance work is complete.",
          tone: "warning",
        },
        {
          label: "Ready Statements",
          value: String(readyStatements),
          detail: "Finalized statement versions currently available across the accessible LP workspace.",
          tone: "success",
        },
      ],
      recentCycles: recentCycles.map((cycle) => ({
        id: cycle.id,
        monthLabel: formatMonth(cycle.periodMonth),
        lpName: cycle.lp.name,
        storeLocation: cycle.storeLocation.name,
        cycleStatus: cycle.status,
        mismatchCount: cycle.mismatches.length,
        statementStatus: mapStatementStatus(cycle.statements[0]?.status),
      })),
    };
  } catch (error) {
    console.error("Failed to load shared dashboard", error);

    return {
      kind: "error",
      userName,
      message:
        "We could not load dashboard metrics right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

export default async function DashboardPage() {
  const access = await getAccessSnapshot();
  const redirectTarget = getDashboardRedirectTarget(access);

  if (redirectTarget) {
    redirect(redirectTarget);
  }

  const state = await getDashboardState(access);
  const roleLabel = getRoleLabel(access.user.systemRole);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Dashboard
            </div>
            <StatusPill label={roleLabel} tone="neutral" />
            {state.kind !== "error" ? (
              <StatusPill label={state.lpLabel} tone="success" />
            ) : null}
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Welcome back, {state.userName}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review live LP reconciliation activity, upload attention, and
              statement readiness across your VendorStream workspace.
            </p>
          </div>
        </header>

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? (
          <EmptyState
            kind="empty"
            userName={state.userName}
            lpLabel={state.lpLabel}
            noWorkspaceAccess={state.noWorkspaceAccess}
          />
        ) : null}
        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {state.summary.map((item) => (
                <SummaryCard key={item.label} item={item} />
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Recent reconciliation cycles
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Recent LP-scoped cycle activity across the workspaces you can
                    access.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {state.recentCycles.map((cycle) => (
                    <div
                      key={cycle.id}
                      className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                    >
                      <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr_1fr_1fr_0.7fr_0.8fr_auto] xl:items-center">
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Month
                          </div>
                          <div className="text-sm font-medium text-white">
                            {cycle.monthLabel}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            LP
                          </div>
                          <div className="text-sm text-slate-300">
                            {cycle.lpName}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Store location
                          </div>
                          <div className="text-sm text-slate-300">
                            {cycle.storeLocation}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Cycle status
                          </div>
                          <StatusPill
                            label={cycle.cycleStatus.replaceAll("_", " ")}
                            tone={
                              cycle.cycleStatus === "STATEMENT_READY" ||
                              cycle.cycleStatus === "RECONCILIATION_PASSED"
                                ? "success"
                                : cycle.cycleStatus === "MISMATCHES_FOUND" ||
                                    cycle.cycleStatus === "AWAITING_UPLOADS" ||
                                    cycle.cycleStatus === "STATEMENT_PENDING" ||
                                    cycle.cycleStatus === "STATEMENT_GENERATING"
                                  ? "warning"
                                  : "neutral"
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Mismatch count
                          </div>
                          <div className="text-sm text-slate-300">
                            {cycle.mismatchCount}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Statement
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getStatementTone(cycle.statementStatus)}`}
                          >
                            {cycle.statementStatus.replaceAll("_", " ")}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                          >
                            <Link href={`/lp/cycles/${cycle.id}`}>View cycle</Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <QuickActionCard
                  title="Upload Monthly File"
                  description="Start the next reconciliation cycle with a new LP source upload."
                  href="/lp/uploads/new"
                />
                <QuickActionCard
                  title="View Import History"
                  description="Review prior upload batches, validation results, and processing progress."
                  href="/lp/uploads"
                />
                <QuickActionCard
                  title="Review Cycles"
                  description="Open LP reconciliation cycles and focus on records that still need attention."
                  href="/lp/cycles"
                />
                <QuickActionCard
                  title="View Statements"
                  description="Browse generated statement versions and inspect finance-ready totals."
                  href="/lp/statements"
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
