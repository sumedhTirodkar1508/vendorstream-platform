import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
  month: string;
  lpName: string;
  storeLocation: string;
  status:
    | "Awaiting Uploads"
    | "Reconciling"
    | "Needs Review"
    | "Statement Ready";
  mismatchCount: number;
  statementStatus: "Not Ready" | "Pending" | "Ready";
};

type SharedDashboardState =
  | {
      kind: "ready";
      summary: DashboardSummary[];
      recentCycles: RecentCycleRow[];
    }
  | {
      kind: "empty";
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "loading";
    };

function getRoleLabel(role?: "USER" | "ADMIN" | "FINANCE_VIEWER") {
  if (role === "ADMIN") {
    return "Admin";
  }

  if (role === "FINANCE_VIEWER") {
    return "Finance Viewer";
  }

  return "Operations User";
}

function getRoleSubtitle(role?: "USER" | "ADMIN" | "FINANCE_VIEWER") {
  if (role === "ADMIN") {
    return "Here’s what needs attention across the platform today.";
  }

  if (role === "FINANCE_VIEWER") {
    return "Here’s the current finance-facing reconciliation and statement activity.";
  }

  return "Here’s what needs attention today.";
}

async function getSharedDashboardState(): Promise<SharedDashboardState> {
  const mockMode = process.env.MOCK_SHARED_DASHBOARD_STATE;

  if (mockMode === "loading") {
    return { kind: "loading" };
  }

  if (mockMode === "error") {
    return {
      kind: "error",
      message:
        "We could not load dashboard metrics right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }

  if (mockMode === "empty") {
    return { kind: "empty" };
  }

  return {
    kind: "ready",
    summary: [
      {
        label: "Active Cycles",
        value: "12",
        detail: "Open reconciliation cycles across licensed producers and store locations.",
        tone: "neutral",
      },
      {
        label: "Pending Uploads",
        value: "5",
        detail: "Cycles still waiting on an LP or store source file before matching can proceed.",
        tone: "warning",
      },
      {
        label: "Open Mismatches",
        value: "27",
        detail: "Row-level issues currently blocking clean reconciliation or statement generation.",
        tone: "warning",
      },
      {
        label: "Ready Statements",
        value: "9",
        detail: "Generated statements available for downstream finance review and export.",
        tone: "success",
      },
    ],
    recentCycles: [
      {
        id: "cycle_apr_downtown",
        month: "April 2026",
        lpName: "Northstar Beverage Group",
        storeLocation: "Toronto Downtown",
        status: "Needs Review",
        mismatchCount: 6,
        statementStatus: "Pending",
      },
      {
        id: "cycle_apr_waterfront",
        month: "April 2026",
        lpName: "Northstar Beverage Group",
        storeLocation: "Toronto Waterfront",
        status: "Reconciling",
        mismatchCount: 2,
        statementStatus: "Not Ready",
      },
      {
        id: "cycle_mar_mississauga",
        month: "March 2026",
        lpName: "Northstar Beverage Group",
        storeLocation: "Mississauga Central",
        status: "Statement Ready",
        mismatchCount: 0,
        statementStatus: "Ready",
      },
      {
        id: "cycle_jan_brampton",
        month: "January 2026",
        lpName: "Metro Beverage Partners",
        storeLocation: "Brampton West",
        status: "Awaiting Uploads",
        mismatchCount: 0,
        statementStatus: "Not Ready",
      },
    ],
  };
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
              <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
              <div className="h-10 w-20 animate-pulse rounded bg-white/10" />
            </CardHeader>
            <CardContent>
              <div className="h-10 animate-pulse rounded-xl bg-white/8" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_0.9fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="h-5 w-56 animate-pulse rounded bg-white/10" />
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {[0, 1, 2, 3].map((item) => (
            <Card
              key={item}
              className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
            >
              <CardHeader className="space-y-3">
                <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
                <div className="h-8 animate-pulse rounded bg-white/8" />
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
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
          Shared dashboard data could not be loaded
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

function EmptyState() {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl text-white">
          No operational activity yet
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          As upload, reconciliation, and statement data is created, this dashboard
          will surface the most important items that need attention.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/uploads/new">Upload monthly file</Link>
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

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const state = await getSharedDashboardState();
  const userName = session.user.name?.trim() || "VendorStream User";
  const roleLabel = getRoleLabel(session.user.systemRole);
  const subtitle = getRoleSubtitle(session.user.systemRole);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Dashboard
            </div>
            <StatusPill label={roleLabel} tone="neutral" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Welcome back, {userName}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              {subtitle}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
            Shared dashboard mode is active. TODO: branch summary cards, quick
            actions, and recent activity by authenticated user role and current
            organization context.
          </div>
        </header>

        {state.kind === "loading" ? <LoadingState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? <EmptyState /> : null}
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
                    Recent activity across LP and store reconciliation work.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {state.recentCycles.map((cycle) => (
                    <div
                      key={cycle.id}
                      className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                    >
                      <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr_1fr_0.9fr_0.7fr_0.8fr] xl:items-center">
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Month
                          </div>
                          <div className="text-sm font-medium text-white">
                            {cycle.month}
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
                            Status
                          </div>
                          <StatusPill
                            label={cycle.status}
                            tone={
                              cycle.status === "Statement Ready"
                                ? "success"
                                : cycle.status === "Needs Review" ||
                                    cycle.status === "Awaiting Uploads"
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
                          <StatusPill
                            label={cycle.statementStatus}
                            tone={
                              cycle.statementStatus === "Ready"
                                ? "success"
                                : cycle.statementStatus === "Pending"
                                  ? "warning"
                                  : "neutral"
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <QuickActionCard
                  title="Upload Monthly File"
                  description="Create a new LP monthly upload and start the next reconciliation cycle."
                  href="/lp/uploads/new"
                />
                <QuickActionCard
                  title="View Import History"
                  description="Review prior upload batches, validation results, and processing progress."
                  href="/lp/uploads"
                />
                <QuickActionCard
                  title="Review Mismatches"
                  description="Open cycles that still require mismatch review or manual intervention."
                  href="/lp/cycles?status=MISMATCHES_FOUND"
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
