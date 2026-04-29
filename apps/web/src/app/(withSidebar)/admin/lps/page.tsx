import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type CycleStatus,
  type LpMembershipRole,
} from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { formatMonthLabel } from "@/lib/format";
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
    | "Total LPs"
    | "Active LPs"
    | "Assigned Store Locations"
    | "Active Cycles";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type LpFilters = {
  lpId: string;
};

type MembershipRow = {
  id: string;
  role: LpMembershipRole;
  userName: string;
  userEmail: string;
};

type AssignmentRow = {
  id: string;
  storeOrganizationName: string;
  storeLocationName: string;
  storeLocationCode: string | null;
  isActive: boolean;
};

type CycleRow = {
  id: string;
  month: Date;
  status: CycleStatus;
  storeLocationName: string;
};

type LpRow = {
  id: string;
  name: string;
  code: string | null;
  legalName: string | null;
  isActive: boolean;
  membershipCount: number;
  assignedStoreLocationsCount: number;
  activeCycleCount: number;
  createdAt: Date;
  updatedAt: Date;
  memberships: MembershipRow[];
  assignments: AssignmentRow[];
  activeCycles: CycleRow[];
};

type AdminLpsState =
  | {
      kind: "ready";
      adminName: string;
      filters: LpFilters;
      summary: SummaryItem[];
      totalCount: number;
      rows: LpRow[];
      selectedLp: LpRow | null;
    }
  | {
      kind: "empty";
      adminName: string;
      filters: LpFilters;
      summary: SummaryItem[];
      totalCount: number;
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

function formatEnumLabel(value: string) {
  return value.replaceAll("_", " ");
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

function formatMonth(date: Date) {
  return formatMonthLabel(date);
}

function buildLpsHref(filters: LpFilters) {
  const params = new URLSearchParams();

  if (filters.lpId) {
    params.set("lpId", filters.lpId);
  }

  const query = params.toString();
  return query ? `/admin/lps?${query}` : "/admin/lps";
}

function getActiveTone(isActive: boolean) {
  if (isActive) {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  return "border-red-400/30 bg-red-500/10 text-red-100";
}

function getCycleTone(status: CycleStatus) {
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

async function getAdminLpsState(
  filters: LpFilters,
  adminName: string,
): Promise<AdminLpsState> {
  try {
    const [totalCount, activeCount, assignmentCount, activeCycleCount, rows] =
      await Promise.all([
        prisma.lP.count(),
        prisma.lP.count({
          where: { isActive: true },
        }),
        prisma.storeLocationLpAssignment.count({
          where: { isActive: true },
        }),
        prisma.reconciliationCycle.count({
          where: {
            status: {
              in: ACTIVE_CYCLE_STATUSES,
            },
          },
        }),
        prisma.lP.findMany({
          orderBy: [{ name: "asc" }],
          take: 50,
          select: {
            id: true,
            name: true,
            code: true,
            legalName: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            memberships: {
              orderBy: [{ createdAt: "asc" }],
              select: {
                id: true,
                role: true,
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
            storeAssignments: {
              where: { isActive: true },
              orderBy: [
                { storeLocation: { storeOrganization: { name: "asc" } } },
                { storeLocation: { name: "asc" } },
              ],
              select: {
                id: true,
                isActive: true,
                storeLocation: {
                  select: {
                    name: true,
                    code: true,
                    storeOrganization: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
            cycles: {
              where: {
                status: {
                  in: ACTIVE_CYCLE_STATUSES,
                },
              },
              orderBy: [{ periodMonth: "desc" }],
              select: {
                id: true,
                periodMonth: true,
                status: true,
                storeLocation: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        }),
      ]);

    const summary: SummaryItem[] = [
      {
        label: "Total LPs",
        value: String(totalCount),
        detail: "All LP entities currently recorded in VendorStream.",
        tone: "neutral",
      },
      {
        label: "Active LPs",
        value: String(activeCount),
        detail: "LPs currently active and eligible for assignments and cycles.",
        tone: "success",
      },
      {
        label: "Assigned Store Locations",
        value: String(assignmentCount),
        detail: "Active LP-to-store-location assignments across the platform.",
        tone: "neutral",
      },
      {
        label: "Active Cycles",
        value: String(activeCycleCount),
        detail: "Reconciliation cycles currently in progress for LP coverage.",
        tone: activeCycleCount > 0 ? "warning" : "success",
      },
    ];

    if (rows.length === 0) {
      return {
        kind: "empty",
        adminName,
        filters,
        summary,
        totalCount,
      };
    }

    const mappedRows: LpRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      legalName: row.legalName,
      isActive: row.isActive,
      membershipCount: row.memberships.length,
      assignedStoreLocationsCount: row.storeAssignments.length,
      activeCycleCount: row.cycles.length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      memberships: row.memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        userName: membership.user.name?.trim() || "VendorStream User",
        userEmail: membership.user.email,
      })),
      assignments: row.storeAssignments.map((assignment) => ({
        id: assignment.id,
        storeOrganizationName:
          assignment.storeLocation.storeOrganization.name,
        storeLocationName: assignment.storeLocation.name,
        storeLocationCode: assignment.storeLocation.code,
        isActive: assignment.isActive,
      })),
      activeCycles: row.cycles.map((cycle) => ({
        id: cycle.id,
        month: cycle.periodMonth,
        status: cycle.status,
        storeLocationName: cycle.storeLocation.name,
      })),
    }));

    const selectedLp =
      mappedRows.find((row) => row.id === filters.lpId) ?? mappedRows[0] ?? null;

    return {
      kind: "ready",
      adminName,
      filters,
      summary,
      totalCount,
      rows: mappedRows,
      selectedLp,
    };
  } catch (error) {
    console.error("Failed to load admin LPs", error);

    return {
      kind: "error",
      message:
        "We could not load LP directory data right now. Try again shortly or contact VendorStream support if the issue persists.",
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
          This LP directory is limited to VendorStream platform administrators.
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
          LPs unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          LP directory could not be loaded
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
  summary,
  totalCount,
}: Extract<AdminLpsState, { kind: "empty" }>) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Reviewing LP directory as{" "}
        <span className="font-medium text-white">{adminName}</span>. There are{" "}
        <span className="font-medium text-white">{totalCount}</span> LP records in
        the current environment.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <SummaryCard key={item.label} item={item} />
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">No LPs found</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            No LP records are currently available in this environment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href="/admin/dashboard">Back to admin dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminLpsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    lpId?: string;
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
              Admin LPs
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                LP directory
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: LpFilters = {
    lpId: resolvedSearchParams?.lpId?.trim() ?? "",
  };

  const adminName = session.user.name?.trim() || "VendorStream Admin";
  const state = await getAdminLpsState(filters, adminName);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin LPs
            </div>
            <StatusBadge
              label="Admin"
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              LP directory
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review LP entities, membership coverage, assignment footprint, and
              active reconciliation load across VendorStream.
            </p>
          </div>
          {"totalCount" in state ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Reviewing LP directory as{" "}
              <span className="font-medium text-white">{state.adminName}</span>.
              Showing <span className="font-medium text-white">{state.totalCount}</span>{" "}
              total LP records.
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
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <CardTitle className="text-xl text-white">LPs</CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Real `LP` records with assignment and active-cycle coverage.
                    </CardDescription>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                    <div className="font-medium text-white">Create LP</div>
                    <div>
                      TODO: wire the LP creation flow once the admin entity
                      management forms are implemented.
                    </div>
                    <div className="pt-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled
                        className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                      >
                        Create LP
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="border-b border-white/8 bg-white/5">
                      <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-4 py-3 font-medium">LP name</th>
                        <th className="px-4 py-3 font-medium">Code</th>
                        <th className="px-4 py-3 font-medium">Legal name</th>
                        <th className="px-4 py-3 font-medium">Active status</th>
                        <th className="px-4 py-3 font-medium">Membership count</th>
                        <th className="px-4 py-3 font-medium">
                          Assigned store locations count
                        </th>
                        <th className="px-4 py-3 font-medium">
                          Active cycle count
                        </th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-white/8 last:border-b-0 ${
                            row.id === state.selectedLp?.id ? "bg-cyan-400/8" : ""
                          }`}
                        >
                          <td className="px-4 py-4 text-sm font-medium text-white">
                            {row.name}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.code ?? "No code"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.legalName ?? "Not available"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={row.isActive ? "Active" : "Inactive"}
                              className={getActiveTone(row.isActive)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.membershipCount}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.assignedStoreLocationsCount}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.activeCycleCount}
                          </td>
                          <td className="px-4 py-4 text-sm">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                              >
                                <Link href={buildLpsHref({ lpId: row.id })}>
                                  View details
                                </Link>
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled
                                className="text-slate-300 disabled:text-slate-500"
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled
                                className="text-slate-300 disabled:text-slate-500"
                              >
                                Deactivate
                              </Button>
                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="text-slate-300 hover:bg-white/5 hover:text-white"
                              >
                                <Link href={buildLpsHref({ lpId: row.id })}>
                                  Open assignments
                                </Link>
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

            {state.selectedLp ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      LP details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Entity profile, coverage counts, and current operational
                      footprint for the selected LP.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow label="LP ID" value={state.selectedLp.id} />
                    <DetailRow label="LP name" value={state.selectedLp.name} />
                    <DetailRow
                      label="Code"
                      value={state.selectedLp.code ?? "No code"}
                    />
                    <DetailRow
                      label="Legal name"
                      value={state.selectedLp.legalName ?? "Not available"}
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusBadge
                          label={state.selectedLp.isActive ? "Active" : "Inactive"}
                          className={getActiveTone(state.selectedLp.isActive)}
                        />
                      }
                    />
                    <DetailRow
                      label="Membership count"
                      value={String(state.selectedLp.membershipCount)}
                    />
                    <DetailRow
                      label="Assigned store locations"
                      value={String(state.selectedLp.assignedStoreLocationsCount)}
                    />
                    <DetailRow
                      label="Active cycle count"
                      value={String(state.selectedLp.activeCycleCount)}
                    />
                    <DetailRow
                      label="Created at"
                      value={formatDateTime(state.selectedLp.createdAt)}
                    />
                    <DetailRow
                      label="Updated at"
                      value={formatDateTime(state.selectedLp.updatedAt)}
                    />
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        LP memberships
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Users currently assigned to this LP.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedLp.memberships.length > 0 ? (
                        state.selectedLp.memberships.map((membership) => (
                          <div
                            key={membership.id}
                            className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-white">
                                  {membership.userName}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {membership.userEmail}
                                </div>
                              </div>
                              <StatusBadge
                                label={formatEnumLabel(membership.role)}
                                className="border-white/10 bg-white/5 text-slate-200"
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyListState label="LP memberships" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Assigned store locations
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Active store locations currently assigned to this LP.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedLp.assignments.length > 0 ? (
                        state.selectedLp.assignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-white">
                                  {assignment.storeLocationName}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {assignment.storeOrganizationName}
                                  {assignment.storeLocationCode
                                    ? ` · ${assignment.storeLocationCode}`
                                    : ""}
                                </div>
                              </div>
                              <StatusBadge
                                label={assignment.isActive ? "Active" : "Inactive"}
                                className={getActiveTone(assignment.isActive)}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyListState label="assigned store locations" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Active cycles
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Cycles currently in progress for this LP.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedLp.activeCycles.length > 0 ? (
                        state.selectedLp.activeCycles.map((cycle) => (
                          <div
                            key={cycle.id}
                            className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-white">
                                  {formatMonth(cycle.month)}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {cycle.storeLocationName}
                                </div>
                              </div>
                              <StatusBadge
                                label={formatEnumLabel(cycle.status)}
                                className={getCycleTone(cycle.status)}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyListState label="active cycles" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        LP actions
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Entity-management mutations are not wired yet, but this
                        directory is ready for future admin flows.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        type="button"
                        disabled
                        className="w-full bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                      >
                        Edit LP
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Deactivate LP
                      </Button>
                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: connect create, edit, and deactivate flows once the
                        corresponding admin LP mutation routes are implemented.
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
