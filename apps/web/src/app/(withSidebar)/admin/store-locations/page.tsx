import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type CycleStatus } from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ActiveStatusFilter = "ACTIVE" | "INACTIVE";

type SummaryItem = {
  label:
    | "Total Store Locations"
    | "Active Store Locations"
    | "Active LP Assignments"
    | "Active Cycles";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type StoreLocationFilters = {
  organization: string;
  activeStatus: string;
  province: string;
  locationId: string;
};

type AssignmentRow = {
  id: string;
  lpName: string;
  lpCode: string | null;
  isActive: boolean;
};

type CycleRow = {
  id: string;
  month: Date;
  status: CycleStatus;
  lpName: string;
};

type StoreLocationRow = {
  id: string;
  name: string;
  code: string | null;
  storeOrganizationId: string;
  storeOrganizationName: string;
  city: string;
  province: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  country: string;
  isActive: boolean;
  lpAssignmentCount: number;
  activeCycleCount: number;
  createdAt: Date;
  updatedAt: Date;
  assignments: AssignmentRow[];
  activeCycles: CycleRow[];
};

type AdminStoreLocationsState =
  | {
      kind: "ready";
      adminName: string;
      filters: StoreLocationFilters;
      summary: SummaryItem[];
      totalCount: number;
      matchingCount: number;
      organizationOptions: Array<{
        id: string;
        name: string;
      }>;
      provinceOptions: string[];
      rows: StoreLocationRow[];
      selectedLocation: StoreLocationRow | null;
    }
  | {
      kind: "empty";
      adminName: string;
      filters: StoreLocationFilters;
      summary: SummaryItem[];
      totalCount: number;
      matchingCount: number;
      organizationOptions: Array<{
        id: string;
        name: string;
      }>;
      provinceOptions: string[];
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

const ACTIVE_STATUS_OPTIONS: ActiveStatusFilter[] = ["ACTIVE", "INACTIVE"];

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
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildStoreLocationsHref(filters: StoreLocationFilters) {
  const params = new URLSearchParams();

  if (filters.organization) {
    params.set("organization", filters.organization);
  }

  if (filters.activeStatus) {
    params.set("activeStatus", filters.activeStatus);
  }

  if (filters.province) {
    params.set("province", filters.province);
  }

  if (filters.locationId) {
    params.set("locationId", filters.locationId);
  }

  const query = params.toString();
  return query ? `/admin/store-locations?${query}` : "/admin/store-locations";
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

async function getAdminStoreLocationsState(
  filters: StoreLocationFilters,
  adminName: string,
): Promise<AdminStoreLocationsState> {
  try {
    const activeStatusFilter = ACTIVE_STATUS_OPTIONS.includes(
      filters.activeStatus as ActiveStatusFilter,
    )
      ? (filters.activeStatus as ActiveStatusFilter)
      : undefined;

    const where = {
      ...(filters.organization
        ? { storeOrganizationId: filters.organization }
        : {}),
      ...(activeStatusFilter === "ACTIVE"
        ? { isActive: true }
        : activeStatusFilter === "INACTIVE"
          ? { isActive: false }
          : {}),
      ...(filters.province ? { province: filters.province } : {}),
    };

    const [
      totalCount,
      matchingCount,
      activeCount,
      activeAssignmentCount,
      activeCycleCount,
      organizationOptions,
      provinceRows,
      rows,
    ] = await Promise.all([
      prisma.storeLocation.count(),
      prisma.storeLocation.count({ where }),
      prisma.storeLocation.count({
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
      prisma.storeOrganization.findMany({
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
        },
      }),
      prisma.storeLocation.findMany({
        select: {
          province: true,
        },
        orderBy: [{ province: "asc" }],
      }),
      prisma.storeLocation.findMany({
        where,
        orderBy: [
          { storeOrganization: { name: "asc" } },
          { name: "asc" },
        ],
        take: 50,
        select: {
          id: true,
          name: true,
          code: true,
          city: true,
          province: true,
          addressLine1: true,
          addressLine2: true,
          postalCode: true,
          country: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          storeOrganization: {
            select: {
              id: true,
              name: true,
            },
          },
          lpAssignments: {
            where: { isActive: true },
            orderBy: [{ createdAt: "asc" }],
            select: {
              id: true,
              isActive: true,
              lp: {
                select: {
                  name: true,
                  code: true,
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
              lp: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const provinceOptions = Array.from(
      new Set(
        provinceRows
          .map((row) => row.province.trim())
          .filter((province) => province.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));

    const summary: SummaryItem[] = [
      {
        label: "Total Store Locations",
        value: String(totalCount),
        detail: "All store locations currently recorded in VendorStream.",
        tone: "neutral",
      },
      {
        label: "Active Store Locations",
        value: String(activeCount),
        detail: "Locations currently active for assignments and reconciliation.",
        tone: "success",
      },
      {
        label: "Active LP Assignments",
        value: String(activeAssignmentCount),
        detail: "Active LP-to-store-location assignments across the platform.",
        tone: "neutral",
      },
      {
        label: "Active Cycles",
        value: String(activeCycleCount),
        detail: "Reconciliation cycles currently in progress across locations.",
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
        matchingCount,
        organizationOptions,
        provinceOptions,
      };
    }

    const mappedRows: StoreLocationRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      storeOrganizationId: row.storeOrganization.id,
      storeOrganizationName: row.storeOrganization.name,
      city: row.city,
      province: row.province,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      postalCode: row.postalCode,
      country: row.country,
      isActive: row.isActive,
      lpAssignmentCount: row.lpAssignments.length,
      activeCycleCount: row.cycles.length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      assignments: row.lpAssignments.map((assignment) => ({
        id: assignment.id,
        lpName: assignment.lp.name,
        lpCode: assignment.lp.code,
        isActive: assignment.isActive,
      })),
      activeCycles: row.cycles.map((cycle) => ({
        id: cycle.id,
        month: cycle.periodMonth,
        status: cycle.status,
        lpName: cycle.lp.name,
      })),
    }));

    const selectedLocation =
      mappedRows.find((row) => row.id === filters.locationId) ??
      mappedRows[0] ??
      null;

    return {
      kind: "ready",
      adminName,
      filters,
      summary,
      totalCount,
      matchingCount,
      organizationOptions,
      provinceOptions,
      rows: mappedRows,
      selectedLocation,
    };
  } catch (error) {
    console.error("Failed to load admin store locations", error);

    return {
      kind: "error",
      message:
        "We could not load store location directory data right now. Try again shortly or contact VendorStream support if the issue persists.",
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
          This store location directory is limited to VendorStream platform
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
          Store locations unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Store location directory could not be loaded
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
  organizationOptions,
  provinceOptions,
}: Extract<AdminStoreLocationsState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.organization || filters.activeStatus || filters.province,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Reviewing store location directory as{" "}
        <span className="font-medium text-white">{adminName}</span>. Showing{" "}
        <span className="font-medium text-white">{matchingCount}</span> matches
        across <span className="font-medium text-white">{totalCount}</span> total
        locations.
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
            Narrow store locations by organization, active status, or province.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <label
                htmlFor="organization"
                className="text-sm font-medium text-slate-200"
              >
                Organization
              </label>
              <select
                id="organization"
                name="organization"
                defaultValue={filters.organization}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All organizations
                </option>
                {organizationOptions.map((organization) => (
                  <option
                    key={organization.id}
                    value={organization.id}
                    className="bg-slate-950 text-white"
                  >
                    {organization.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="activeStatus"
                className="text-sm font-medium text-slate-200"
              >
                Active status
              </label>
              <select
                id="activeStatus"
                name="activeStatus"
                defaultValue={filters.activeStatus}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  Any status
                </option>
                {ACTIVE_STATUS_OPTIONS.map((activeStatus) => (
                  <option
                    key={activeStatus}
                    value={activeStatus}
                    className="bg-slate-950 text-white"
                  >
                    {formatEnumLabel(activeStatus)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="province"
                className="text-sm font-medium text-slate-200"
              >
                Province
              </label>
              <select
                id="province"
                name="province"
                defaultValue={filters.province}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All provinces
                </option>
                {provinceOptions.map((province) => (
                  <option
                    key={province}
                    value={province}
                    className="bg-slate-950 text-white"
                  >
                    {province}
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
                <Link href="/admin/store-locations">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No store locations found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No store locations match the current filter set."
              : "No store locations are currently available in this environment."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href="/admin/dashboard">Back to admin dashboard</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link href="/admin/store-locations">Reset filters</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminStoreLocationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    organization?: string;
    activeStatus?: string;
    province?: string;
    locationId?: string;
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
              Admin Store Locations
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Store location directory
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: StoreLocationFilters = {
    organization: resolvedSearchParams?.organization?.trim() ?? "",
    activeStatus: resolvedSearchParams?.activeStatus?.trim() ?? "",
    province: resolvedSearchParams?.province?.trim() ?? "",
    locationId: resolvedSearchParams?.locationId?.trim() ?? "",
  };

  const adminName = session.user.name?.trim() || "VendorStream Admin";
  const state = await getAdminStoreLocationsState(filters, adminName);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin Store Locations
            </div>
            <StatusBadge
              label="Admin"
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Store location directory
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review store locations, organization ownership, LP assignment
              coverage, and active reconciliation load across VendorStream.
            </p>
          </div>
          {"totalCount" in state ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Reviewing store location directory as{" "}
              <span className="font-medium text-white">{state.adminName}</span>.
              Showing{" "}
              <span className="font-medium text-white">{state.matchingCount}</span>{" "}
              matches out of{" "}
              <span className="font-medium text-white">{state.totalCount}</span>{" "}
              total locations.
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
                  Narrow store locations by organization, active status, or
                  province.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="space-y-2">
                    <label
                      htmlFor="organization"
                      className="text-sm font-medium text-slate-200"
                    >
                      Organization
                    </label>
                    <select
                      id="organization"
                      name="organization"
                      defaultValue={state.filters.organization}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All organizations
                      </option>
                      {state.organizationOptions.map((organization) => (
                        <option
                          key={organization.id}
                          value={organization.id}
                          className="bg-slate-950 text-white"
                        >
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="activeStatus"
                      className="text-sm font-medium text-slate-200"
                    >
                      Active status
                    </label>
                    <select
                      id="activeStatus"
                      name="activeStatus"
                      defaultValue={state.filters.activeStatus}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        Any status
                      </option>
                      {ACTIVE_STATUS_OPTIONS.map((activeStatus) => (
                        <option
                          key={activeStatus}
                          value={activeStatus}
                          className="bg-slate-950 text-white"
                        >
                          {formatEnumLabel(activeStatus)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="province"
                      className="text-sm font-medium text-slate-200"
                    >
                      Province
                    </label>
                    <select
                      id="province"
                      name="province"
                      defaultValue={state.filters.province}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All provinces
                      </option>
                      {state.provinceOptions.map((province) => (
                        <option
                          key={province}
                          value={province}
                          className="bg-slate-950 text-white"
                        >
                          {province}
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
                      <Link href="/admin/store-locations">Reset</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Store locations
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real `StoreLocation` records with organization ownership,
                  assignment counts, and active-cycle coverage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="border-b border-white/8 bg-white/5">
                      <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-4 py-3 font-medium">Location name</th>
                        <th className="px-4 py-3 font-medium">Code</th>
                        <th className="px-4 py-3 font-medium">
                          Store organization
                        </th>
                        <th className="px-4 py-3 font-medium">City</th>
                        <th className="px-4 py-3 font-medium">Province</th>
                        <th className="px-4 py-3 font-medium">Active status</th>
                        <th className="px-4 py-3 font-medium">
                          LP assignment count
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
                            row.id === state.selectedLocation?.id
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
                            {row.storeOrganizationName}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.city}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.province}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={row.isActive ? "Active" : "Inactive"}
                              className={getActiveTone(row.isActive)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.lpAssignmentCount}
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
                                  href={buildStoreLocationsHref({
                                    ...state.filters,
                                    locationId: row.id,
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
                                  href={buildStoreLocationsHref({
                                    ...state.filters,
                                    locationId: row.id,
                                  })}
                                >
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

            {state.selectedLocation ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Store location details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Organization ownership, address context, assignments, and
                      current operational footprint for the selected store
                      location.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow
                      label="Store location ID"
                      value={state.selectedLocation.id}
                    />
                    <DetailRow
                      label="Location name"
                      value={state.selectedLocation.name}
                    />
                    <DetailRow
                      label="Code"
                      value={state.selectedLocation.code ?? "No code"}
                    />
                    <DetailRow
                      label="Store organization"
                      value={state.selectedLocation.storeOrganizationName}
                    />
                    <DetailRow
                      label="Address"
                      value={
                        <span className="text-right">
                          {state.selectedLocation.addressLine1}
                          {state.selectedLocation.addressLine2
                            ? `, ${state.selectedLocation.addressLine2}`
                            : ""}
                        </span>
                      }
                    />
                    <DetailRow
                      label="City / province"
                      value={`${state.selectedLocation.city}, ${state.selectedLocation.province}`}
                    />
                    <DetailRow
                      label="Postal code"
                      value={state.selectedLocation.postalCode}
                    />
                    <DetailRow
                      label="Country"
                      value={state.selectedLocation.country}
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusBadge
                          label={
                            state.selectedLocation.isActive ? "Active" : "Inactive"
                          }
                          className={getActiveTone(
                            state.selectedLocation.isActive,
                          )}
                        />
                      }
                    />
                    <DetailRow
                      label="LP assignment count"
                      value={String(state.selectedLocation.lpAssignmentCount)}
                    />
                    <DetailRow
                      label="Active cycle count"
                      value={String(state.selectedLocation.activeCycleCount)}
                    />
                    <DetailRow
                      label="Created at"
                      value={formatDateTime(state.selectedLocation.createdAt)}
                    />
                    <DetailRow
                      label="Updated at"
                      value={formatDateTime(state.selectedLocation.updatedAt)}
                    />
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        LP assignments
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Active LP assignments currently linked to this location.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedLocation.assignments.length > 0 ? (
                        state.selectedLocation.assignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-white">
                                  {assignment.lpName}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {assignment.lpCode ?? "No code"}
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
                        <EmptyListState label="LP assignments" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Active cycles
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Cycles currently in progress for this location.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedLocation.activeCycles.length > 0 ? (
                        state.selectedLocation.activeCycles.map((cycle) => (
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
                                  {cycle.lpName}
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
                        Store location actions
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
                        Edit store location
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Deactivate store location
                      </Button>
                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: connect edit and deactivate flows once the
                        corresponding admin store location mutation routes are
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
