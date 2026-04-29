import Link from "next/link";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma, type CycleStatus } from "@vendorstream/database";
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

type ActiveStatusFilter = "ACTIVE" | "INACTIVE";

type SummaryItem = {
  label:
    | "Total Assignments"
    | "Active Assignments"
    | "Inactive Assignments"
    | "Active Related Cycles";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type AssignmentFilters = {
  lp: string;
  storeOrganization: string;
  storeLocation: string;
  activeStatus: string;
  assignmentId: string;
  mutation: string;
};

type RelatedCycleRow = {
  id: string;
  month: Date;
  status: CycleStatus;
};

type AssignmentRow = {
  id: string;
  lpId: string;
  lpName: string;
  lpCode: string | null;
  storeOrganizationId: string;
  storeOrganizationName: string;
  storeLocationId: string;
  storeLocationName: string;
  storeLocationCode: string | null;
  isActive: boolean;
  startsOn: Date | null;
  endsOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
  relatedCycleCount: number;
  relatedCycles: RelatedCycleRow[];
};

type SelectOption = {
  id: string;
  name: string;
};

type AdminAssignmentsState =
  | {
      kind: "ready";
      adminName: string;
      filters: AssignmentFilters;
      summary: SummaryItem[];
      totalCount: number;
      matchingCount: number;
      lpOptions: SelectOption[];
      storeOrganizationOptions: SelectOption[];
      storeLocationOptions: SelectOption[];
      rows: AssignmentRow[];
      selectedAssignment: AssignmentRow | null;
    }
  | {
      kind: "empty";
      adminName: string;
      filters: AssignmentFilters;
      summary: SummaryItem[];
      totalCount: number;
      matchingCount: number;
      lpOptions: SelectOption[];
      storeOrganizationOptions: SelectOption[];
      storeLocationOptions: SelectOption[];
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

function formatDate(date: Date | null) {
  if (!date) {
    return "Open-ended";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatMonth(date: Date) {
  return formatMonthLabel(date);
}

function buildAssignmentsHref(
  filters: Omit<AssignmentFilters, "mutation"> & { mutation?: string },
) {
  const params = new URLSearchParams();

  if (filters.lp) {
    params.set("lp", filters.lp);
  }

  if (filters.storeOrganization) {
    params.set("storeOrganization", filters.storeOrganization);
  }

  if (filters.storeLocation) {
    params.set("storeLocation", filters.storeLocation);
  }

  if (filters.activeStatus) {
    params.set("activeStatus", filters.activeStatus);
  }

  if (filters.assignmentId) {
    params.set("assignmentId", filters.assignmentId);
  }

  if (filters.mutation) {
    params.set("mutation", filters.mutation);
  }

  const query = params.toString();
  return query ? `/admin/assignments?${query}` : "/admin/assignments";
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

function getMutationBanner(mutation: string) {
  if (mutation === "activated") {
    return {
      tone: "success" as const,
      message: "Assignment activated successfully.",
    };
  }

  if (mutation === "deactivated") {
    return {
      tone: "success" as const,
      message: "Assignment deactivated successfully.",
    };
  }

  if (mutation === "invalid") {
    return {
      tone: "warning" as const,
      message: "The submitted assignment action was invalid.",
    };
  }

  if (mutation === "not_found") {
    return {
      tone: "warning" as const,
      message: "The selected assignment could not be found.",
    };
  }

  if (mutation === "forbidden") {
    return {
      tone: "warning" as const,
      message: "You are not authorized to manage assignments.",
    };
  }

  if (mutation === "error") {
    return {
      tone: "warning" as const,
      message: "The assignment action could not be completed. Try again shortly.",
    };
  }

  return null;
}

async function toggleAssignmentStatus(formData: FormData) {
  "use server";

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const filters = {
    lp: String(formData.get("lpFilter") || "").trim(),
    storeOrganization: String(formData.get("storeOrganizationFilter") || "").trim(),
    storeLocation: String(formData.get("storeLocationFilter") || "").trim(),
    activeStatus: String(formData.get("activeStatusFilter") || "").trim(),
    assignmentId: String(formData.get("assignmentId") || "").trim(),
  };

  if (!session.user.id || session.user.systemRole !== "ADMIN") {
    redirect(
      buildAssignmentsHref({
        ...filters,
        mutation: "forbidden",
      }),
    );
  }

  const assignmentId = filters.assignmentId;
  const nextStatus = String(formData.get("nextStatus") || "").trim();

  if (!assignmentId || !["ACTIVE", "INACTIVE"].includes(nextStatus)) {
    redirect(
      buildAssignmentsHref({
        ...filters,
        mutation: "invalid",
      }),
    );
  }

  try {
    const assignment = await prisma.storeLocationLpAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true },
    });

    if (!assignment) {
      redirect(
        buildAssignmentsHref({
          ...filters,
          mutation: "not_found",
        }),
      );
    }

    await prisma.storeLocationLpAssignment.update({
      where: { id: assignmentId },
      data: {
        isActive: nextStatus === "ACTIVE",
      },
    });

    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/assignments");
    revalidatePath("/admin/lps");
    revalidatePath("/admin/store-locations");

    redirect(
      buildAssignmentsHref({
        ...filters,
        mutation: nextStatus === "ACTIVE" ? "activated" : "deactivated",
      }),
    );
  } catch (error) {
    console.error("Failed to update assignment status", error);

    redirect(
      buildAssignmentsHref({
        ...filters,
        mutation: "error",
      }),
    );
  }
}

async function getAdminAssignmentsState(
  filters: AssignmentFilters,
  adminName: string,
): Promise<AdminAssignmentsState> {
  try {
    const activeStatusFilter = ACTIVE_STATUS_OPTIONS.includes(
      filters.activeStatus as ActiveStatusFilter,
    )
      ? (filters.activeStatus as ActiveStatusFilter)
      : undefined;

    const where = {
      ...(filters.lp ? { lpId: filters.lp } : {}),
      ...(filters.storeOrganization
        ? { storeLocation: { storeOrganizationId: filters.storeOrganization } }
        : {}),
      ...(filters.storeLocation ? { storeLocationId: filters.storeLocation } : {}),
      ...(activeStatusFilter === "ACTIVE"
        ? { isActive: true }
        : activeStatusFilter === "INACTIVE"
          ? { isActive: false }
          : {}),
    };

    const storeLocationWhere = filters.storeOrganization
      ? { storeOrganizationId: filters.storeOrganization }
      : undefined;

    const [
      totalCount,
      matchingCount,
      activeCount,
      inactiveCount,
      activeRelatedCycleCount,
      lpOptions,
      storeOrganizationOptions,
      storeLocationOptions,
      rows,
    ] = await Promise.all([
      prisma.storeLocationLpAssignment.count(),
      prisma.storeLocationLpAssignment.count({ where }),
      prisma.storeLocationLpAssignment.count({
        where: { isActive: true },
      }),
      prisma.storeLocationLpAssignment.count({
        where: { isActive: false },
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
        select: {
          id: true,
          name: true,
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
        where: storeLocationWhere,
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          storeOrganization: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.storeLocationLpAssignment.findMany({
        where,
        orderBy: [
          { lp: { name: "asc" } },
          { storeLocation: { storeOrganization: { name: "asc" } } },
          { storeLocation: { name: "asc" } },
        ],
        take: 50,
        select: {
          id: true,
          isActive: true,
          startsOn: true,
          endsOn: true,
          createdAt: true,
          updatedAt: true,
          lp: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          storeLocation: {
            select: {
              id: true,
              name: true,
              code: true,
              storeOrganization: {
                select: {
                  id: true,
                  name: true,
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
                  lpId: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const normalizedStoreLocationOptions: SelectOption[] = storeLocationOptions.map(
      (location) => ({
        id: location.id,
        name: `${location.name} · ${location.storeOrganization.name}`,
      }),
    );

    const summary: SummaryItem[] = [
      {
        label: "Total Assignments",
        value: String(totalCount),
        detail: "All LP-to-store-location assignments currently recorded.",
        tone: "neutral",
      },
      {
        label: "Active Assignments",
        value: String(activeCount),
        detail: "Assignments currently active for operational coverage.",
        tone: "success",
      },
      {
        label: "Inactive Assignments",
        value: String(inactiveCount),
        detail: "Assignments that have been deactivated but remain in history.",
        tone: inactiveCount > 0 ? "warning" : "neutral",
      },
      {
        label: "Active Related Cycles",
        value: String(activeRelatedCycleCount),
        detail: "Cycles currently in progress across assignment coverage.",
        tone: activeRelatedCycleCount > 0 ? "warning" : "success",
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
        lpOptions,
        storeOrganizationOptions,
        storeLocationOptions: normalizedStoreLocationOptions,
      };
    }

    const mappedRows: AssignmentRow[] = rows.map((row) => {
      const relatedCycles = row.storeLocation.cycles
        .filter((cycle) => cycle.lpId === row.lp.id)
        .map((cycle) => ({
          id: cycle.id,
          month: cycle.periodMonth,
          status: cycle.status,
        }));

      return {
        id: row.id,
        lpId: row.lp.id,
        lpName: row.lp.name,
        lpCode: row.lp.code,
        storeOrganizationId: row.storeLocation.storeOrganization.id,
        storeOrganizationName: row.storeLocation.storeOrganization.name,
        storeLocationId: row.storeLocation.id,
        storeLocationName: row.storeLocation.name,
        storeLocationCode: row.storeLocation.code,
        isActive: row.isActive,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        relatedCycleCount: relatedCycles.length,
        relatedCycles,
      };
    });

    const selectedAssignment =
      mappedRows.find((row) => row.id === filters.assignmentId) ??
      mappedRows[0] ??
      null;

    return {
      kind: "ready",
      adminName,
      filters,
      summary,
      totalCount,
      matchingCount,
      lpOptions,
      storeOrganizationOptions,
      storeLocationOptions: normalizedStoreLocationOptions,
      rows: mappedRows,
      selectedAssignment,
    };
  } catch (error) {
    console.error("Failed to load admin assignments", error);

    return {
      kind: "error",
      message:
        "We could not load assignment data right now. Try again shortly or contact VendorStream support if the issue persists.",
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
          This assignment management surface is limited to VendorStream platform
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
          Assignments unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Assignment data could not be loaded
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
  lpOptions,
  storeOrganizationOptions,
  storeLocationOptions,
}: Extract<AdminAssignmentsState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.lp ||
      filters.storeOrganization ||
      filters.storeLocation ||
      filters.activeStatus,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Reviewing assignments as{" "}
        <span className="font-medium text-white">{adminName}</span>. Showing{" "}
        <span className="font-medium text-white">{matchingCount}</span> matches
        across <span className="font-medium text-white">{totalCount}</span> total
        assignment records.
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
            Narrow assignments by LP, store organization, store location, or
            active status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <div className="space-y-2">
              <label htmlFor="lp" className="text-sm font-medium text-slate-200">
                LP
              </label>
              <select
                id="lp"
                name="lp"
                defaultValue={filters.lp}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All LPs
                </option>
                {lpOptions.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    className="bg-slate-950 text-white"
                  >
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="storeOrganization"
                className="text-sm font-medium text-slate-200"
              >
                Store organization
              </label>
              <select
                id="storeOrganization"
                name="storeOrganization"
                defaultValue={filters.storeOrganization}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All organizations
                </option>
                {storeOrganizationOptions.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    className="bg-slate-950 text-white"
                  >
                    {option.name}
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
                  All locations
                </option>
                {storeLocationOptions.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    className="bg-slate-950 text-white"
                  >
                    {option.name}
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
                <Link href="/admin/assignments">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No assignments found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No assignments match the current filter set."
              : "No assignment records are currently available in this environment."}
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
            <Link href="/admin/assignments">Reset filters</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminAssignmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    lp?: string;
    storeOrganization?: string;
    storeLocation?: string;
    activeStatus?: string;
    assignmentId?: string;
    mutation?: string;
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
              Admin Assignments
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Assignment management
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: AssignmentFilters = {
    lp: resolvedSearchParams?.lp?.trim() ?? "",
    storeOrganization: resolvedSearchParams?.storeOrganization?.trim() ?? "",
    storeLocation: resolvedSearchParams?.storeLocation?.trim() ?? "",
    activeStatus: resolvedSearchParams?.activeStatus?.trim() ?? "",
    assignmentId: resolvedSearchParams?.assignmentId?.trim() ?? "",
    mutation: resolvedSearchParams?.mutation?.trim() ?? "",
  };

  const adminName = session.user.name?.trim() || "VendorStream Admin";
  const state = await getAdminAssignmentsState(filters, adminName);
  const mutationBanner = getMutationBanner(filters.mutation);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin Assignments
            </div>
            <StatusBadge
              label="Admin"
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Assignment management
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review LP-to-store-location assignments, inspect related cycle
              coverage, and manage assignment activation across VendorStream.
            </p>
          </div>
          {"totalCount" in state ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Reviewing assignments as{" "}
              <span className="font-medium text-white">{state.adminName}</span>.
              Showing{" "}
              <span className="font-medium text-white">{state.matchingCount}</span>{" "}
              matches out of{" "}
              <span className="font-medium text-white">{state.totalCount}</span>{" "}
              total assignment records.
            </div>
          ) : null}
        </header>

        {mutationBanner ? (
          <div
            className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${
              mutationBanner.tone === "success"
                ? "border-emerald-400/20 bg-emerald-500/8 text-emerald-100"
                : "border-amber-400/20 bg-amber-500/8 text-amber-100"
            }`}
          >
            {mutationBanner.message}
          </div>
        ) : null}

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
                  Narrow assignments by LP, store organization, store location,
                  or active status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <div className="space-y-2">
                    <label
                      htmlFor="lp"
                      className="text-sm font-medium text-slate-200"
                    >
                      LP
                    </label>
                    <select
                      id="lp"
                      name="lp"
                      defaultValue={state.filters.lp}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All LPs
                      </option>
                      {state.lpOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          className="bg-slate-950 text-white"
                        >
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="storeOrganization"
                      className="text-sm font-medium text-slate-200"
                    >
                      Store organization
                    </label>
                    <select
                      id="storeOrganization"
                      name="storeOrganization"
                      defaultValue={state.filters.storeOrganization}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All organizations
                      </option>
                      {state.storeOrganizationOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          className="bg-slate-950 text-white"
                        >
                          {option.name}
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
                      defaultValue={state.filters.storeLocation}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All locations
                      </option>
                      {state.storeLocationOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          className="bg-slate-950 text-white"
                        >
                          {option.name}
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
                      <Link href="/admin/assignments">Reset</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Assignments
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Real `StoreLocationLpAssignment` records with LP, store
                      organization, store location, and related cycle context.
                    </CardDescription>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                    <div className="font-medium text-white">
                      Create assignment
                    </div>
                    <div>
                      TODO: wire the assignment creation flow once the admin
                      assignment mutation forms are implemented.
                    </div>
                    <div className="pt-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled
                        className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                      >
                        Create assignment
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
                        <th className="px-4 py-3 font-medium">LP</th>
                        <th className="px-4 py-3 font-medium">
                          Store organization
                        </th>
                        <th className="px-4 py-3 font-medium">
                          Store location
                        </th>
                        <th className="px-4 py-3 font-medium">Active status</th>
                        <th className="px-4 py-3 font-medium">Starts on</th>
                        <th className="px-4 py-3 font-medium">Ends on</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-white/8 last:border-b-0 ${
                            row.id === state.selectedAssignment?.id
                              ? "bg-cyan-400/8"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-4 text-sm font-medium text-white">
                            {row.lpName}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.storeOrganizationName}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.storeLocationName}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={row.isActive ? "Active" : "Inactive"}
                              className={getActiveTone(row.isActive)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDate(row.startsOn)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDate(row.endsOn)}
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
                                  href={buildAssignmentsHref({
                                    ...state.filters,
                                    assignmentId: row.id,
                                    mutation: undefined,
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
                                Edit date range
                              </Button>

                              <form action={toggleAssignmentStatus}>
                                <input
                                  type="hidden"
                                  name="assignmentId"
                                  value={row.id}
                                />
                                <input
                                  type="hidden"
                                  name="lpFilter"
                                  value={state.filters.lp}
                                />
                                <input
                                  type="hidden"
                                  name="storeOrganizationFilter"
                                  value={state.filters.storeOrganization}
                                />
                                <input
                                  type="hidden"
                                  name="storeLocationFilter"
                                  value={state.filters.storeLocation}
                                />
                                <input
                                  type="hidden"
                                  name="activeStatusFilter"
                                  value={state.filters.activeStatus}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  name="nextStatus"
                                  value={row.isActive ? "INACTIVE" : "ACTIVE"}
                                  variant="outline"
                                  className={
                                    row.isActive
                                      ? "border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                                      : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                                  }
                                >
                                  {row.isActive ? "Deactivate" : "Activate"}
                                </Button>
                              </form>

                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="text-slate-300 hover:bg-white/5 hover:text-white"
                              >
                                <Link
                                  href={buildAssignmentsHref({
                                    ...state.filters,
                                    assignmentId: row.id,
                                    mutation: undefined,
                                  })}
                                >
                                  View related cycles
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

            {state.selectedAssignment ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Assignment details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Review the selected LP-to-store-location assignment,
                      lifecycle dates, and related cycle coverage.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow
                      label="Assignment ID"
                      value={state.selectedAssignment.id}
                    />
                    <DetailRow
                      label="LP"
                      value={state.selectedAssignment.lpName}
                    />
                    <DetailRow
                      label="LP code"
                      value={state.selectedAssignment.lpCode ?? "No code"}
                    />
                    <DetailRow
                      label="Store organization"
                      value={state.selectedAssignment.storeOrganizationName}
                    />
                    <DetailRow
                      label="Store location"
                      value={state.selectedAssignment.storeLocationName}
                    />
                    <DetailRow
                      label="Store location code"
                      value={
                        state.selectedAssignment.storeLocationCode ?? "No code"
                      }
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusBadge
                          label={
                            state.selectedAssignment.isActive
                              ? "Active"
                              : "Inactive"
                          }
                          className={getActiveTone(
                            state.selectedAssignment.isActive,
                          )}
                        />
                      }
                    />
                    <DetailRow
                      label="Starts on"
                      value={formatDate(state.selectedAssignment.startsOn)}
                    />
                    <DetailRow
                      label="Ends on"
                      value={formatDate(state.selectedAssignment.endsOn)}
                    />
                    <DetailRow
                      label="Related active cycles"
                      value={String(state.selectedAssignment.relatedCycleCount)}
                    />
                    <DetailRow
                      label="Created at"
                      value={formatDateTime(state.selectedAssignment.createdAt)}
                    />
                    <DetailRow
                      label="Updated at"
                      value={formatDateTime(state.selectedAssignment.updatedAt)}
                    />
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Related cycles
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Cycles currently in progress for this LP and store
                        location pairing.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedAssignment.relatedCycles.length > 0 ? (
                        state.selectedAssignment.relatedCycles.map((cycle) => (
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
                                  {cycle.id}
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
                        <EmptyListState label="related cycles" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Assignment actions
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Activation can be managed now. Create and date-range
                        editing flows can be connected when those admin mutation
                        routes are available.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <form action={toggleAssignmentStatus}>
                        <input
                          type="hidden"
                          name="assignmentId"
                          value={state.selectedAssignment.id}
                        />
                        <input
                          type="hidden"
                          name="lpFilter"
                          value={state.filters.lp}
                        />
                        <input
                          type="hidden"
                          name="storeOrganizationFilter"
                          value={state.filters.storeOrganization}
                        />
                        <input
                          type="hidden"
                          name="storeLocationFilter"
                          value={state.filters.storeLocation}
                        />
                        <input
                          type="hidden"
                          name="activeStatusFilter"
                          value={state.filters.activeStatus}
                        />
                        <Button
                          type="submit"
                          name="nextStatus"
                          value={
                            state.selectedAssignment.isActive
                              ? "INACTIVE"
                              : "ACTIVE"
                          }
                          className={
                            state.selectedAssignment.isActive
                              ? "w-full bg-red-500 text-white hover:bg-red-400"
                              : "w-full bg-emerald-500 text-white hover:bg-emerald-400"
                          }
                        >
                          {state.selectedAssignment.isActive
                            ? "Deactivate assignment"
                            : "Activate assignment"}
                        </Button>
                      </form>

                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Edit date range
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Create assignment
                      </Button>

                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: connect create-assignment and edit-date-range flows
                        once the corresponding admin mutation routes are
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
