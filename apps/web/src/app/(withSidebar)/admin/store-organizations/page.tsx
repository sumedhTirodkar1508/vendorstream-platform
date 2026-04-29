import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type CycleStatus,
  type StoreOrgMembershipRole,
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
    | "Total Store Organizations"
    | "Active Store Organizations"
    | "Store Locations"
    | "Active Cycles";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type StoreOrganizationFilters = {
  storeOrganizationId: string;
};

type MembershipRow = {
  id: string;
  role: StoreOrgMembershipRole;
  userName: string;
  userEmail: string;
};

type LocationRow = {
  id: string;
  name: string;
  code: string | null;
  city: string;
  province: string;
  isActive: boolean;
};

type CycleRow = {
  id: string;
  month: Date;
  status: CycleStatus;
  lpName: string;
  storeLocationName: string;
};

type StoreOrganizationRow = {
  id: string;
  name: string;
  code: string | null;
  legalName: string | null;
  isActive: boolean;
  membershipCount: number;
  locationCount: number;
  activeCycleCount: number;
  createdAt: Date;
  updatedAt: Date;
  memberships: MembershipRow[];
  locations: LocationRow[];
  activeCycles: CycleRow[];
};

type AdminStoreOrganizationsState =
  | {
      kind: "ready";
      adminName: string;
      filters: StoreOrganizationFilters;
      summary: SummaryItem[];
      totalCount: number;
      rows: StoreOrganizationRow[];
      selectedStoreOrganization: StoreOrganizationRow | null;
    }
  | {
      kind: "empty";
      adminName: string;
      filters: StoreOrganizationFilters;
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

function buildStoreOrganizationsHref(filters: StoreOrganizationFilters) {
  const params = new URLSearchParams();

  if (filters.storeOrganizationId) {
    params.set("storeOrganizationId", filters.storeOrganizationId);
  }

  const query = params.toString();
  return query
    ? `/admin/store-organizations?${query}`
    : "/admin/store-organizations";
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

async function getAdminStoreOrganizationsState(
  filters: StoreOrganizationFilters,
  adminName: string,
): Promise<AdminStoreOrganizationsState> {
  try {
    const [
      totalCount,
      activeCount,
      locationCount,
      activeCycleCount,
      rows,
      activeCycles,
    ] =
      await Promise.all([
        prisma.storeOrganization.count(),
        prisma.storeOrganization.count({
          where: { isActive: true },
        }),
        prisma.storeLocation.count(),
        prisma.reconciliationCycle.count({
          where: {
            status: {
              in: ACTIVE_CYCLE_STATUSES,
            },
          },
        }),
        prisma.storeOrganization.findMany({
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
            locations: {
              orderBy: [{ name: "asc" }],
              select: {
                id: true,
                name: true,
                code: true,
                city: true,
                province: true,
                isActive: true,
              },
            },
          },
        }),
        prisma.reconciliationCycle.findMany({
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
            lp: {
              select: {
                name: true,
              },
            },
            storeLocation: {
              select: {
                name: true,
                storeOrganizationId: true,
              },
            },
          },
        }),
      ]);

    const activeCyclesByStoreOrganizationId = new Map<string, CycleRow[]>();

    for (const cycle of activeCycles) {
      const list =
        activeCyclesByStoreOrganizationId.get(
          cycle.storeLocation.storeOrganizationId,
        ) ?? [];

      list.push({
        id: cycle.id,
        month: cycle.periodMonth,
        status: cycle.status,
        lpName: cycle.lp.name,
        storeLocationName: cycle.storeLocation.name,
      });

      activeCyclesByStoreOrganizationId.set(
        cycle.storeLocation.storeOrganizationId,
        list,
      );
    }

    const summary: SummaryItem[] = [
      {
        label: "Total Store Organizations",
        value: String(totalCount),
        detail: "All store organizations currently recorded in VendorStream.",
        tone: "neutral",
      },
      {
        label: "Active Store Organizations",
        value: String(activeCount),
        detail: "Store organizations currently active for locations and cycles.",
        tone: "success",
      },
      {
        label: "Store Locations",
        value: String(locationCount),
        detail: "Store locations currently linked across all store organizations.",
        tone: "neutral",
      },
      {
        label: "Active Cycles",
        value: String(activeCycleCount),
        detail: "Reconciliation cycles currently in progress across store entities.",
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

    const mappedRows: StoreOrganizationRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      legalName: row.legalName,
      isActive: row.isActive,
      membershipCount: row.memberships.length,
      locationCount: row.locations.length,
      activeCycleCount:
        activeCyclesByStoreOrganizationId.get(row.id)?.length ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      memberships: row.memberships.map((membership) => ({
        id: membership.id,
        role: membership.role,
        userName: membership.user.name?.trim() || "VendorStream User",
        userEmail: membership.user.email,
      })),
      locations: row.locations.map((location) => ({
        id: location.id,
        name: location.name,
        code: location.code,
        city: location.city,
        province: location.province,
        isActive: location.isActive,
      })),
      activeCycles:
        activeCyclesByStoreOrganizationId.get(row.id)?.slice(0, 8) ?? [],
    }));

    const selectedStoreOrganization =
      mappedRows.find((row) => row.id === filters.storeOrganizationId) ??
      mappedRows[0] ??
      null;

    return {
      kind: "ready",
      adminName,
      filters,
      summary,
      totalCount,
      rows: mappedRows,
      selectedStoreOrganization,
    };
  } catch (error) {
    console.error("Failed to load admin store organizations", error);

    return {
      kind: "error",
      message:
        "We could not load store organization directory data right now. Try again shortly or contact VendorStream support if the issue persists.",
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
          This store organization directory is limited to VendorStream platform
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
          Store organizations unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Store organization directory could not be loaded
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
}: Extract<AdminStoreOrganizationsState, { kind: "empty" }>) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Reviewing store organization directory as{" "}
        <span className="font-medium text-white">{adminName}</span>. There are{" "}
        <span className="font-medium text-white">{totalCount}</span> store
        organization records in the current environment.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <SummaryCard key={item.label} item={item} />
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No store organizations found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            No store organization records are currently available in this
            environment.
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

export default async function AdminStoreOrganizationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    storeOrganizationId?: string;
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
              Admin Store Organizations
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Store organization directory
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: StoreOrganizationFilters = {
    storeOrganizationId:
      resolvedSearchParams?.storeOrganizationId?.trim() ?? "",
  };

  const adminName = session.user.name?.trim() || "VendorStream Admin";
  const state = await getAdminStoreOrganizationsState(filters, adminName);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin Store Organizations
            </div>
            <StatusBadge
              label="Admin"
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Store organization directory
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review store organizations, membership coverage, location footprint,
              and active reconciliation load across VendorStream.
            </p>
          </div>
          {"totalCount" in state ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Reviewing store organization directory as{" "}
              <span className="font-medium text-white">{state.adminName}</span>.
              Showing{" "}
              <span className="font-medium text-white">{state.totalCount}</span>{" "}
              total store organization records.
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
                    <CardTitle className="text-xl text-white">
                      Store organizations
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Real `StoreOrganization` records with location and
                      active-cycle coverage.
                    </CardDescription>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                    <div className="font-medium text-white">
                      Create store organization
                    </div>
                    <div>
                      TODO: wire the store organization creation flow once admin
                      entity management forms are implemented.
                    </div>
                    <div className="pt-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled
                        className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                      >
                        Create store organization
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
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Code</th>
                        <th className="px-4 py-3 font-medium">Legal name</th>
                        <th className="px-4 py-3 font-medium">Active status</th>
                        <th className="px-4 py-3 font-medium">Membership count</th>
                        <th className="px-4 py-3 font-medium">Location count</th>
                        <th className="px-4 py-3 font-medium">Active cycle count</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-white/8 last:border-b-0 ${
                            row.id === state.selectedStoreOrganization?.id
                              ? "bg-cyan-400/8"
                              : ""
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
                            {row.locationCount}
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
                                <Link
                                  href={buildStoreOrganizationsHref({
                                    storeOrganizationId: row.id,
                                  })}
                                >
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
                                <Link
                                  href={buildStoreOrganizationsHref({
                                    storeOrganizationId: row.id,
                                  })}
                                >
                                  Open locations
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

            {state.selectedStoreOrganization ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Store organization details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Entity profile, location coverage, and current operational
                      footprint for the selected store organization.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow
                      label="Store organization ID"
                      value={state.selectedStoreOrganization.id}
                    />
                    <DetailRow
                      label="Name"
                      value={state.selectedStoreOrganization.name}
                    />
                    <DetailRow
                      label="Code"
                      value={state.selectedStoreOrganization.code ?? "No code"}
                    />
                    <DetailRow
                      label="Legal name"
                      value={
                        state.selectedStoreOrganization.legalName ??
                        "Not available"
                      }
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusBadge
                          label={
                            state.selectedStoreOrganization.isActive
                              ? "Active"
                              : "Inactive"
                          }
                          className={getActiveTone(
                            state.selectedStoreOrganization.isActive,
                          )}
                        />
                      }
                    />
                    <DetailRow
                      label="Membership count"
                      value={String(state.selectedStoreOrganization.membershipCount)}
                    />
                    <DetailRow
                      label="Location count"
                      value={String(state.selectedStoreOrganization.locationCount)}
                    />
                    <DetailRow
                      label="Active cycle count"
                      value={String(
                        state.selectedStoreOrganization.activeCycleCount,
                      )}
                    />
                    <DetailRow
                      label="Created at"
                      value={formatDateTime(
                        state.selectedStoreOrganization.createdAt,
                      )}
                    />
                    <DetailRow
                      label="Updated at"
                      value={formatDateTime(
                        state.selectedStoreOrganization.updatedAt,
                      )}
                    />
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Store organization memberships
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Users currently assigned to this store organization.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedStoreOrganization.memberships.length > 0 ? (
                        state.selectedStoreOrganization.memberships.map(
                          (membership) => (
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
                          ),
                        )
                      ) : (
                        <EmptyListState label="store organization memberships" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Store locations
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Locations currently linked to this store organization.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedStoreOrganization.locations.length > 0 ? (
                        state.selectedStoreOrganization.locations.map((location) => (
                          <div
                            key={location.id}
                            className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-white">
                                  {location.name}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {location.city}, {location.province}
                                  {location.code ? ` · ${location.code}` : ""}
                                </div>
                              </div>
                              <StatusBadge
                                label={location.isActive ? "Active" : "Inactive"}
                                className={getActiveTone(location.isActive)}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyListState label="store locations" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Active cycles
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Cycles currently in progress for this store organization.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedStoreOrganization.activeCycles.length > 0 ? (
                        state.selectedStoreOrganization.activeCycles.map(
                          (cycle) => (
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
                                    {cycle.storeLocationName} · {cycle.lpName}
                                  </div>
                                </div>
                                <StatusBadge
                                  label={formatEnumLabel(cycle.status)}
                                  className={getCycleTone(cycle.status)}
                                />
                              </div>
                            </div>
                          ),
                        )
                      ) : (
                        <EmptyListState label="active cycles" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Store organization actions
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
                        Edit store organization
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Deactivate store organization
                      </Button>
                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: connect create, edit, and deactivate flows once the
                        corresponding admin store organization mutation routes are
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
