import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type AccessRequestStatus,
  type AccessRequestType,
  type CycleStatus,
  type InvitationStatus,
  type StatementTaskStatus,
} from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
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
    | "Pending Access Requests"
    | "Pending Invitations"
    | "Active Cycles"
    | "Open Mismatches"
    | "Pending Statement Tasks";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type AccessRequestRow = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  requestType: AccessRequestType;
  requestedCompany: string;
  status: AccessRequestStatus;
  submittedAt: Date;
};

type InvitationRow = {
  id: string;
  email: string;
  targetName: string;
  roleLabel: string;
  status: InvitationStatus;
  expiresAt: Date;
};

type CycleRow = {
  id: string;
  month: Date;
  lpName: string;
  storeLocationName: string;
  status: CycleStatus;
  mismatchCount: number;
  statementTaskStatus: StatementTaskStatus | null;
  updatedAt: Date;
};

type AdminDashboardState =
  | {
      kind: "ready";
      adminName: string;
      platform: {
        activeUsers: number;
        activeLps: number;
        activeStoreOrganizations: number;
      };
      summary: SummaryItem[];
      recentAccessRequests: AccessRequestRow[];
      recentInvitations: InvitationRow[];
      highAttentionCycles: CycleRow[];
    }
  | {
      kind: "empty";
      adminName: string;
      platform: {
        activeUsers: number;
        activeLps: number;
        activeStoreOrganizations: number;
      };
      summary: SummaryItem[];
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "error";
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

const HIGH_ATTENTION_CYCLE_STATUSES: CycleStatus[] = [
  "AWAITING_UPLOADS",
  "READY_FOR_RECONCILIATION",
  "RECONCILING",
  "MISMATCHES_FOUND",
  "STATEMENT_PENDING",
  "STATEMENT_GENERATING",
  "FAILED",
];

const PENDING_STATEMENT_TASK_STATUSES: StatementTaskStatus[] = [
  "PENDING",
  "PROCESSING",
];

const HIGH_ATTENTION_STATEMENT_TASK_STATUSES: StatementTaskStatus[] = [
  "PENDING",
  "PROCESSING",
  "FAILED",
];

function formatDateTime(date: Date) {
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

function formatEnumLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getAccessRequestTone(status: AccessRequestStatus) {
  if (status === "APPROVED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "REJECTED" || status === "CANCELED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  return "border-amber-400/30 bg-amber-500/10 text-amber-100";
}

function getInvitationTone(status: InvitationStatus) {
  if (status === "ACCEPTED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "EXPIRED" || status === "REVOKED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  return "border-amber-400/30 bg-amber-500/10 text-amber-100";
}

function getCycleTone(status: CycleStatus) {
  if (status === "STATEMENT_READY" || status === "RECONCILIATION_PASSED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (
    status === "MISMATCHES_FOUND" ||
    status === "AWAITING_UPLOADS" ||
    status === "STATEMENT_PENDING" ||
    status === "STATEMENT_GENERATING"
  ) {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getStatementTaskTone(status: StatementTaskStatus | null) {
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

async function getAdminDashboardState(
  adminName: string,
): Promise<AdminDashboardState> {
  try {
    const [
      pendingAccessRequestCount,
      pendingInvitationCount,
      activeCycleCount,
      openMismatchCount,
      pendingStatementTaskCount,
      activeUserCount,
      activeLpCount,
      activeStoreOrganizationCount,
      recentAccessRequests,
      recentInvitations,
      candidateCycles,
      openMismatchCounts,
    ] = await Promise.all([
      prisma.accessRequest.count({
        where: { status: "PENDING" },
      }),
      prisma.invitation.count({
        where: { status: "PENDING" },
      }),
      prisma.reconciliationCycle.count({
        where: {
          status: {
            in: ACTIVE_CYCLE_STATUSES,
          },
        },
      }),
      prisma.mismatch.count({
        where: { status: "OPEN" },
      }),
      prisma.statementTask.count({
        where: {
          status: {
            in: PENDING_STATEMENT_TASK_STATUSES,
          },
        },
      }),
      prisma.user.count({
        where: { status: "ACTIVE" },
      }),
      prisma.lP.count({
        where: { isActive: true },
      }),
      prisma.storeOrganization.count({
        where: { isActive: true },
      }),
      prisma.accessRequest.findMany({
        orderBy: [{ submittedAt: "desc" }],
        take: 5,
        select: {
          id: true,
          requesterName: true,
          requesterEmail: true,
          type: true,
          requestedCompanyName: true,
          status: true,
          submittedAt: true,
          lp: {
            select: {
              name: true,
            },
          },
          storeOrganization: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.invitation.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          email: true,
          status: true,
          expiresAt: true,
          lpRole: true,
          storeOrgRole: true,
          lp: {
            select: {
              name: true,
            },
          },
          storeOrganization: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.reconciliationCycle.findMany({
        where: {
          OR: [
            {
              status: {
                in: HIGH_ATTENTION_CYCLE_STATUSES,
              },
            },
            {
              mismatches: {
                some: {
                  status: "OPEN",
                },
              },
            },
            {
              statementTasks: {
                some: {
                  status: {
                    in: HIGH_ATTENTION_STATEMENT_TASK_STATUSES,
                  },
                },
              },
            },
          ],
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 12,
        select: {
          id: true,
          periodMonth: true,
          status: true,
          updatedAt: true,
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
          statementTasks: {
            orderBy: [{ createdAt: "desc" }],
            take: 1,
            select: {
              status: true,
            },
          },
        },
      }),
      prisma.mismatch.groupBy({
        by: ["cycleId"],
        where: {
          status: "OPEN",
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const mismatchCountByCycleId = new Map(
      openMismatchCounts.map((entry) => [entry.cycleId, entry._count._all]),
    );

    const highAttentionCycles: CycleRow[] = candidateCycles
      .map((cycle) => ({
        id: cycle.id,
        month: cycle.periodMonth,
        lpName: cycle.lp.name,
        storeLocationName: cycle.storeLocation.name,
        status: cycle.status,
        mismatchCount: mismatchCountByCycleId.get(cycle.id) ?? 0,
        statementTaskStatus: cycle.statementTasks[0]?.status ?? null,
        updatedAt: cycle.updatedAt,
      }))
      .sort((a, b) => {
        if (a.mismatchCount !== b.mismatchCount) {
          return b.mismatchCount - a.mismatchCount;
        }

        const aTaskWeight =
          a.statementTaskStatus === "FAILED"
            ? 2
            : a.statementTaskStatus === "PENDING" ||
                a.statementTaskStatus === "PROCESSING"
              ? 1
              : 0;
        const bTaskWeight =
          b.statementTaskStatus === "FAILED"
            ? 2
            : b.statementTaskStatus === "PENDING" ||
                b.statementTaskStatus === "PROCESSING"
              ? 1
              : 0;

        if (aTaskWeight !== bTaskWeight) {
          return bTaskWeight - aTaskWeight;
        }

        return b.updatedAt.getTime() - a.updatedAt.getTime();
      })
      .slice(0, 5);

    const summary: SummaryItem[] = [
      {
        label: "Pending Access Requests",
        value: String(pendingAccessRequestCount),
        detail: "Requests waiting for platform review before a user can be assigned LP or store access.",
        tone: pendingAccessRequestCount > 0 ? "warning" : "success",
      },
      {
        label: "Pending Invitations",
        value: String(pendingInvitationCount),
        detail: "Invitations that have been issued but not yet accepted or expired.",
        tone: pendingInvitationCount > 0 ? "neutral" : "success",
      },
      {
        label: "Active Cycles",
        value: String(activeCycleCount),
        detail: "Reconciliation cycles still in flight across uploads, mismatch review, and statement generation.",
        tone: "neutral",
      },
      {
        label: "Open Mismatches",
        value: String(openMismatchCount),
        detail: "Cycle issues currently blocking clean reconciliation or final statement readiness.",
        tone: openMismatchCount > 0 ? "warning" : "success",
      },
      {
        label: "Pending Statement Tasks",
        value: String(pendingStatementTaskCount),
        detail: "Statement generation tasks that are queued or still processing.",
        tone: pendingStatementTaskCount > 0 ? "warning" : "success",
      },
    ];

    const mappedAccessRequests: AccessRequestRow[] = recentAccessRequests.map(
      (request) => ({
        id: request.id,
        requesterName: request.requesterName,
        requesterEmail: request.requesterEmail,
        requestType: request.type,
        requestedCompany:
          request.requestedCompanyName ||
          request.lp?.name ||
          request.storeOrganization?.name ||
          "Not specified",
        status: request.status,
        submittedAt: request.submittedAt,
      }),
    );

    const mappedInvitations: InvitationRow[] = recentInvitations.map(
      (invitation) => ({
        id: invitation.id,
        email: invitation.email,
        targetName:
          invitation.lp?.name ||
          invitation.storeOrganization?.name ||
          "Not specified",
        roleLabel: formatEnumLabel(
          invitation.lpRole || invitation.storeOrgRole || "NOT_SPECIFIED",
        ),
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      }),
    );

    if (
      pendingAccessRequestCount === 0 &&
      pendingInvitationCount === 0 &&
      activeCycleCount === 0 &&
      openMismatchCount === 0 &&
      pendingStatementTaskCount === 0 &&
      mappedAccessRequests.length === 0 &&
      mappedInvitations.length === 0 &&
      highAttentionCycles.length === 0
    ) {
      return {
        kind: "empty",
        adminName,
        platform: {
          activeUsers: activeUserCount,
          activeLps: activeLpCount,
          activeStoreOrganizations: activeStoreOrganizationCount,
        },
        summary,
      };
    }

    return {
      kind: "ready",
      adminName,
      platform: {
        activeUsers: activeUserCount,
        activeLps: activeLpCount,
        activeStoreOrganizations: activeStoreOrganizationCount,
      },
      summary,
      recentAccessRequests: mappedAccessRequests,
      recentInvitations: mappedInvitations,
      highAttentionCycles,
    };
  } catch (error) {
    console.error("Failed to load admin dashboard", error);

    return {
      kind: "error",
      message:
        "We could not load platform operations data right now. Try again shortly or contact VendorStream support if the issue persists.",
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
          This dashboard is limited to VendorStream platform administrators.
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
          Dashboard unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Admin operations data could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  adminName,
  platform,
  summary,
}: Extract<AdminDashboardState, { kind: "empty" }>) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Welcome, <span className="font-medium text-white">{adminName}</span>. The
        platform currently covers {platform.activeUsers} active users,{" "}
        {platform.activeLps} active LPs, and {platform.activeStoreOrganizations}{" "}
        active store organizations.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summary.map((item) => (
          <SummaryCard key={item.label} item={item} />
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No admin operational backlog right now
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Access requests, invitations, cycle escalations, and statement task
            backlog will appear here as the platform activity grows.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <QuickActionCard
            title="Access Requests"
            description="Review company access requests as they arrive."
            href="/admin/access-requests"
          />
          <QuickActionCard
            title="Invitations"
            description="Issue and monitor invitation activity across LPs and store organizations."
            href="/admin/invitations"
          />
          <QuickActionCard
            title="Users"
            description="Manage user accounts, roles, and platform access."
            href="/admin/users"
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminDashboardPage() {
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
              Admin Dashboard
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Platform operations
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const adminName = session.user.name?.trim() || "VendorStream Admin";
  const state = await getAdminDashboardState(adminName);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin Dashboard
            </div>
            <StatusBadge
              label="Admin"
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Welcome back, {adminName}
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Monitor platform access operations, invitation activity, cycle
              exceptions, and statement-generation backlog across VendorStream.
            </p>
          </div>
          {"platform" in state ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Platform coverage:{" "}
              <span className="font-medium text-white">
                {state.platform.activeUsers}
              </span>{" "}
              active users,{" "}
              <span className="font-medium text-white">
                {state.platform.activeLps}
              </span>{" "}
              active LPs, and{" "}
              <span className="font-medium text-white">
                {state.platform.activeStoreOrganizations}
              </span>{" "}
              active store organizations.
            </div>
          ) : null}
        </header>

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? <EmptyState {...state} /> : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {state.summary.map((item) => (
                <SummaryCard key={item.label} item={item} />
              ))}
            </div>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Recent access requests
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Latest platform access requests submitted by prospective or
                      existing users.
                    </CardDescription>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Link href="/admin/access-requests">Go to access requests</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {state.recentAccessRequests.length > 0 ? (
                  <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                    <table className="min-w-full border-collapse text-left">
                      <thead className="border-b border-white/8 bg-white/5">
                        <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          <th className="px-4 py-3 font-medium">Requester name</th>
                          <th className="px-4 py-3 font-medium">Requester email</th>
                          <th className="px-4 py-3 font-medium">Request type</th>
                          <th className="px-4 py-3 font-medium">Requested company</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Submitted at</th>
                          <th className="px-4 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.recentAccessRequests.map((request) => (
                          <tr
                            key={request.id}
                            className="border-b border-white/8 last:border-b-0"
                          >
                            <td className="px-4 py-4 text-sm font-medium text-white">
                              {request.requesterName}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {request.requesterEmail}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {formatEnumLabel(request.requestType)}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {request.requestedCompany}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              <StatusBadge
                                label={formatEnumLabel(request.status)}
                                className={getAccessRequestTone(request.status)}
                              />
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {formatDateTime(request.submittedAt)}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                              >
                                <Link
                                  href={`/admin/access-requests?requestId=${request.id}`}
                                >
                                  View request
                                </Link>
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                    No recent access requests are currently available.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Recent invitations
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Latest user invitations issued across LP and store
                        organization contexts.
                      </CardDescription>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      <Link href="/admin/invitations">Go to invitations</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {state.recentInvitations.length > 0 ? (
                    state.recentInvitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                      >
                        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr_0.8fr_0.9fr_auto] xl:items-start">
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              Email
                            </div>
                            <div className="text-sm font-medium text-white">
                              {invitation.email}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              Target LP / store org
                            </div>
                            <div className="text-sm text-slate-300">
                              {invitation.targetName}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              Role
                            </div>
                            <div className="text-sm text-slate-300">
                              {invitation.roleLabel}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              Status
                            </div>
                            <StatusBadge
                              label={formatEnumLabel(invitation.status)}
                              className={getInvitationTone(invitation.status)}
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              Expires at
                            </div>
                            <div className="text-sm text-slate-300">
                              {formatDateTime(invitation.expiresAt)}
                            </div>
                          </div>
                          <div className="flex xl:justify-end">
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                            >
                              <Link
                                href={`/admin/invitations?invitationId=${invitation.id}`}
                              >
                                View invitation
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                      No recent invitations are currently available.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Recent high-attention cycles
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Reconciliation cycles with open mismatches, task failures,
                        or unresolved upload-state pressure.
                      </CardDescription>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      <Link href="/admin/cycles">Go to cycles</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {state.highAttentionCycles.length > 0 ? (
                    state.highAttentionCycles.map((cycle) => (
                      <div
                        key={cycle.id}
                        className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                      >
                        <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr_1fr_0.9fr_0.7fr_0.9fr_auto] xl:items-start">
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              Month
                            </div>
                            <div className="text-sm font-medium text-white">
                              {formatMonth(cycle.month)}
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
                              {cycle.storeLocationName}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              Status
                            </div>
                            <StatusBadge
                              label={formatEnumLabel(cycle.status)}
                              className={getCycleTone(cycle.status)}
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
                              Statement task
                            </div>
                            <StatusBadge
                              label={
                                cycle.statementTaskStatus
                                  ? formatEnumLabel(cycle.statementTaskStatus)
                                  : "Not Started"
                              }
                              className={getStatementTaskTone(
                                cycle.statementTaskStatus,
                              )}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                            >
                              <Link href={`/admin/cycles?cycleId=${cycle.id}`}>
                                View cycle
                              </Link>
                            </Button>
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="text-slate-300 hover:bg-white/5 hover:text-white"
                            >
                              <Link
                                href={`/admin/statement-tasks?cycleId=${cycle.id}`}
                              >
                                Statement tasks
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                      No high-attention cycles are currently available.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Quick admin actions
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Jump directly into the main platform administration surfaces.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <QuickActionCard
                  title="Access Requests"
                  description="Review pending access requests and approve or reject company access."
                  href="/admin/access-requests"
                />
                <QuickActionCard
                  title="Invitations"
                  description="Manage invitation issuance, expiry, and onboarding follow-through."
                  href="/admin/invitations"
                />
                <QuickActionCard
                  title="Users"
                  description="Inspect user accounts, role assignments, and overall account status."
                  href="/admin/users"
                />
                <QuickActionCard
                  title="LPs"
                  description="Open LP administration and review producer coverage across the platform."
                  href="/admin/lps"
                />
                <QuickActionCard
                  title="Store Organizations"
                  description="Manage store organization records and platform access coverage."
                  href="/admin/store-organizations"
                />
                <QuickActionCard
                  title="Statement Tasks"
                  description="Track statement generation backlog, processing failures, and retries."
                  href="/admin/statement-tasks"
                />
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </main>
  );
}
