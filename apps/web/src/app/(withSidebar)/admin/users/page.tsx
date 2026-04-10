import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type LpMembershipRole,
  type StoreOrgMembershipRole,
  type SystemRole,
  type UserStatus,
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

type EmailVerificationFilter = "VERIFIED" | "UNVERIFIED";

type SummaryItem = {
  label: "Total Users" | "Active Users" | "Suspended Users" | "Verified Emails";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type UserFilters = {
  systemRole: string;
  status: string;
  emailVerified: string;
  userId: string;
};

type MembershipRow = {
  id: string;
  targetName: string;
  targetCode: string | null;
  role: LpMembershipRole | StoreOrgMembershipRole;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  systemRole: SystemRole;
  status: UserStatus;
  isEmailVerified: boolean;
  lpMembershipCount: number;
  storeOrgMembershipCount: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activeSessionCount: number;
  sentInvitationCount: number;
  reviewedAccessRequestCount: number;
  lpMemberships: MembershipRow[];
  storeOrgMemberships: MembershipRow[];
};

type AdminUsersState =
  | {
      kind: "ready";
      adminName: string;
      filters: UserFilters;
      summary: SummaryItem[];
      totalCount: number;
      matchingCount: number;
      rows: UserRow[];
      selectedUser: UserRow | null;
    }
  | {
      kind: "empty";
      adminName: string;
      filters: UserFilters;
      summary: SummaryItem[];
      totalCount: number;
      matchingCount: number;
    }
  | {
      kind: "error";
      message: string;
    };

const SYSTEM_ROLE_OPTIONS: SystemRole[] = ["USER", "ADMIN", "FINANCE_VIEWER"];
const USER_STATUS_OPTIONS: UserStatus[] = ["ACTIVE", "SUSPENDED"];
const EMAIL_VERIFICATION_OPTIONS: EmailVerificationFilter[] = [
  "VERIFIED",
  "UNVERIFIED",
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

function buildUsersHref(filters: UserFilters) {
  const params = new URLSearchParams();

  if (filters.systemRole) {
    params.set("systemRole", filters.systemRole);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.emailVerified) {
    params.set("emailVerified", filters.emailVerified);
  }

  if (filters.userId) {
    params.set("userId", filters.userId);
  }

  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

function getStatusTone(status: UserStatus) {
  if (status === "ACTIVE") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  return "border-red-400/30 bg-red-500/10 text-red-100";
}

function getRoleTone(role: SystemRole) {
  if (role === "ADMIN") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
  }

  if (role === "FINANCE_VIEWER") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getVerificationTone(isVerified: boolean) {
  if (isVerified) {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
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

function EmptyMembershipState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
      No {label.toLowerCase()} are currently assigned.
    </div>
  );
}

async function getAdminUsersState(
  filters: UserFilters,
  adminName: string,
): Promise<AdminUsersState> {
  try {
    const systemRoleFilter = SYSTEM_ROLE_OPTIONS.includes(filters.systemRole as SystemRole)
      ? (filters.systemRole as SystemRole)
      : undefined;
    const statusFilter = USER_STATUS_OPTIONS.includes(filters.status as UserStatus)
      ? (filters.status as UserStatus)
      : undefined;
    const emailVerifiedFilter = EMAIL_VERIFICATION_OPTIONS.includes(
      filters.emailVerified as EmailVerificationFilter,
    )
      ? (filters.emailVerified as EmailVerificationFilter)
      : undefined;

    const where = {
      ...(systemRoleFilter ? { systemRole: systemRoleFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(emailVerifiedFilter === "VERIFIED"
        ? { emailVerified: { not: null } }
        : emailVerifiedFilter === "UNVERIFIED"
          ? { emailVerified: null }
          : {}),
    };

    const now = new Date();

    const [
      totalCount,
      matchingCount,
      activeCount,
      suspendedCount,
      verifiedCount,
      rows,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where }),
      prisma.user.count({
        where: { status: "ACTIVE" },
      }),
      prisma.user.count({
        where: { status: "SUSPENDED" },
      }),
      prisma.user.count({
        where: { emailVerified: { not: null } },
      }),
      prisma.user.findMany({
        where,
        orderBy: [{ email: "asc" }],
        take: 50,
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          systemRole: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          sessions: {
            select: {
              id: true,
              expires: true,
            },
          },
          lpMemberships: {
            orderBy: [{ createdAt: "asc" }],
            select: {
              id: true,
              role: true,
              lp: {
                select: {
                  name: true,
                  code: true,
                },
              },
            },
          },
          storeOrgMemberships: {
            orderBy: [{ createdAt: "asc" }],
            select: {
              id: true,
              role: true,
              storeOrganization: {
                select: {
                  name: true,
                  code: true,
                },
              },
            },
          },
          _count: {
            select: {
              lpMemberships: true,
              storeOrgMemberships: true,
              sentInvitations: true,
              reviewedAccessRequests: true,
            },
          },
        },
      }),
    ]);

    const summary: SummaryItem[] = [
      {
        label: "Total Users",
        value: String(totalCount),
        detail: "All VendorStream user accounts across admin, LP, and store access.",
        tone: "neutral",
      },
      {
        label: "Active Users",
        value: String(activeCount),
        detail: "Accounts currently active and allowed to access the platform.",
        tone: "success",
      },
      {
        label: "Suspended Users",
        value: String(suspendedCount),
        detail: "Accounts that are currently suspended pending administrator action.",
        tone: suspendedCount > 0 ? "warning" : "neutral",
      },
      {
        label: "Verified Emails",
        value: String(verifiedCount),
        detail: "Accounts that have completed email verification.",
        tone: "success",
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
      };
    }

    const mappedRows: UserRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name?.trim() || "VendorStream User",
      email: row.email,
      systemRole: row.systemRole,
      status: row.status,
      isEmailVerified: row.emailVerified !== null,
      lpMembershipCount: row._count.lpMemberships,
      storeOrgMembershipCount: row._count.storeOrgMemberships,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      activeSessionCount: row.sessions.filter((session) => session.expires > now)
        .length,
      sentInvitationCount: row._count.sentInvitations,
      reviewedAccessRequestCount: row._count.reviewedAccessRequests,
      lpMemberships: row.lpMemberships.map((membership) => ({
        id: membership.id,
        targetName: membership.lp.name,
        targetCode: membership.lp.code,
        role: membership.role,
      })),
      storeOrgMemberships: row.storeOrgMemberships.map((membership) => ({
        id: membership.id,
        targetName: membership.storeOrganization.name,
        targetCode: membership.storeOrganization.code,
        role: membership.role,
      })),
    }));

    const selectedUser =
      mappedRows.find((row) => row.id === filters.userId) ?? mappedRows[0] ?? null;

    return {
      kind: "ready",
      adminName,
      filters,
      summary,
      totalCount,
      matchingCount,
      rows: mappedRows,
      selectedUser,
    };
  } catch (error) {
    console.error("Failed to load admin users", error);

    return {
      kind: "error",
      message:
        "We could not load user directory data right now. Try again shortly or contact VendorStream support if the issue persists.",
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
          This user directory is limited to VendorStream platform administrators.
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
          Users unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          User directory could not be loaded
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
}: Extract<AdminUsersState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.systemRole || filters.status || filters.emailVerified,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Reviewing user directory as{" "}
        <span className="font-medium text-white">{adminName}</span>. Showing{" "}
        <span className="font-medium text-white">{matchingCount}</span> matches
        across <span className="font-medium text-white">{totalCount}</span> total
        accounts.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <SummaryCard key={item.label} item={item} />
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">No users found</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No user accounts match the current filter set."
              : "No user accounts are currently available."}
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
            <Link href="/admin/users">Reset filters</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    systemRole?: string;
    status?: string;
    emailVerified?: string;
    userId?: string;
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
              Admin Users
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                User directory
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: UserFilters = {
    systemRole: resolvedSearchParams?.systemRole?.trim() ?? "",
    status: resolvedSearchParams?.status?.trim() ?? "",
    emailVerified: resolvedSearchParams?.emailVerified?.trim() ?? "",
    userId: resolvedSearchParams?.userId?.trim() ?? "",
  };

  const adminName = session.user.name?.trim() || "VendorStream Admin";
  const state = await getAdminUsersState(filters, adminName);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin Users
            </div>
            <StatusBadge
              label="Admin"
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              User directory
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review platform users, account state, and LP or store organization
              membership context across VendorStream.
            </p>
          </div>
          {"totalCount" in state ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Reviewing user directory as{" "}
              <span className="font-medium text-white">{state.adminName}</span>.
              Showing{" "}
              <span className="font-medium text-white">{state.matchingCount}</span>{" "}
              matching users out of{" "}
              <span className="font-medium text-white">{state.totalCount}</span>{" "}
              total accounts.
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
                  Narrow the directory by system role, account status, or email
                  verification state.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
                  <div className="space-y-2">
                    <label
                      htmlFor="systemRole"
                      className="text-sm font-medium text-slate-200"
                    >
                      System role
                    </label>
                    <select
                      id="systemRole"
                      name="systemRole"
                      defaultValue={state.filters.systemRole}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All system roles
                      </option>
                      {SYSTEM_ROLE_OPTIONS.map((systemRole) => (
                        <option
                          key={systemRole}
                          value={systemRole}
                          className="bg-slate-950 text-white"
                        >
                          {formatEnumLabel(systemRole)}
                        </option>
                      ))}
                    </select>
                  </div>

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
                      {USER_STATUS_OPTIONS.map((status) => (
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
                      htmlFor="emailVerified"
                      className="text-sm font-medium text-slate-200"
                    >
                      Email verified
                    </label>
                    <select
                      id="emailVerified"
                      name="emailVerified"
                      defaultValue={state.filters.emailVerified}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        Any verification state
                      </option>
                      {EMAIL_VERIFICATION_OPTIONS.map((emailVerified) => (
                        <option
                          key={emailVerified}
                          value={emailVerified}
                          className="bg-slate-950 text-white"
                        >
                          {formatEnumLabel(emailVerified)}
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
                      <Link href="/admin/users">Reset</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">Users</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real `User` records with membership counts and account-state
                  context.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="border-b border-white/8 bg-white/5">
                      <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium">System role</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Email verified</th>
                        <th className="px-4 py-3 font-medium">
                          LP memberships
                        </th>
                        <th className="px-4 py-3 font-medium">
                          Store org memberships
                        </th>
                        <th className="px-4 py-3 font-medium">Last login at</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-white/8 last:border-b-0 ${
                            row.id === state.selectedUser?.id ? "bg-cyan-400/8" : ""
                          }`}
                        >
                          <td className="px-4 py-4 text-sm font-medium text-white">
                            {row.name}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.email}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={formatEnumLabel(row.systemRole)}
                              className={getRoleTone(row.systemRole)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={formatEnumLabel(row.status)}
                              className={getStatusTone(row.status)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={row.isEmailVerified ? "Verified" : "Pending"}
                              className={getVerificationTone(row.isEmailVerified)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.lpMembershipCount}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.storeOrgMembershipCount}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.lastLoginAt)}
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
                                  href={buildUsersHref({
                                    ...state.filters,
                                    userId: row.id,
                                  })}
                                >
                                  View user details
                                </Link>
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled
                                className="text-slate-300 disabled:text-slate-500"
                              >
                                {row.status === "ACTIVE" ? "Suspend" : "Activate"}
                              </Button>

                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="text-slate-300 hover:bg-white/5 hover:text-white"
                              >
                                <Link
                                  href={buildUsersHref({
                                    ...state.filters,
                                    userId: row.id,
                                  })}
                                >
                                  Open memberships
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

            {state.selectedUser ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      User details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Account state, login context, and membership counts for the
                      selected user.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow label="User ID" value={state.selectedUser.id} />
                    <DetailRow label="Name" value={state.selectedUser.name} />
                    <DetailRow label="Email" value={state.selectedUser.email} />
                    <DetailRow
                      label="System role"
                      value={
                        <StatusBadge
                          label={formatEnumLabel(state.selectedUser.systemRole)}
                          className={getRoleTone(state.selectedUser.systemRole)}
                        />
                      }
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusBadge
                          label={formatEnumLabel(state.selectedUser.status)}
                          className={getStatusTone(state.selectedUser.status)}
                        />
                      }
                    />
                    <DetailRow
                      label="Email verified"
                      value={
                        <StatusBadge
                          label={
                            state.selectedUser.isEmailVerified
                              ? "Verified"
                              : "Pending"
                          }
                          className={getVerificationTone(
                            state.selectedUser.isEmailVerified,
                          )}
                        />
                      }
                    />
                    <DetailRow
                      label="Last login at"
                      value={formatDateTime(state.selectedUser.lastLoginAt)}
                    />
                    <DetailRow
                      label="Created at"
                      value={formatDateTime(state.selectedUser.createdAt)}
                    />
                    <DetailRow
                      label="Updated at"
                      value={formatDateTime(state.selectedUser.updatedAt)}
                    />
                    <DetailRow
                      label="Active sessions"
                      value={String(state.selectedUser.activeSessionCount)}
                    />
                    <DetailRow
                      label="Invitations sent"
                      value={String(state.selectedUser.sentInvitationCount)}
                    />
                    <DetailRow
                      label="Access requests reviewed"
                      value={String(state.selectedUser.reviewedAccessRequestCount)}
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
                        LP memberships assigned to this user account.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedUser.lpMemberships.length > 0 ? (
                        state.selectedUser.lpMemberships.map((membership) => (
                          <div
                            key={membership.id}
                            className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-white">
                                  {membership.targetName}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {membership.targetCode ?? "No code"}
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
                        <EmptyMembershipState label="LP memberships" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Store organization memberships
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Store organization memberships assigned to this user account.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedUser.storeOrgMemberships.length > 0 ? (
                        state.selectedUser.storeOrgMemberships.map((membership) => (
                          <div
                            key={membership.id}
                            className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-white">
                                  {membership.targetName}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {membership.targetCode ?? "No code"}
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
                        <EmptyMembershipState label="Store organization memberships" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Admin actions
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Account-state mutations are not wired yet, but the directory
                        is ready for future admin flows.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        type="button"
                        disabled
                        className="w-full bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                      >
                        {state.selectedUser.status === "ACTIVE"
                          ? "Suspend user"
                          : "Activate user"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Send invite
                      </Button>
                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: connect suspend, activate, and invite flows once the
                        corresponding admin mutation routes are implemented.
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
