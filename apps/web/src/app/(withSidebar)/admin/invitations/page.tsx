import Link from "next/link";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  prisma,
  type InvitationStatus,
  type LpMembershipRole,
  type StoreOrgMembershipRole,
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

type TargetType = "LP" | "STORE_ORGANIZATION";

type SummaryItem = {
  label: "Pending" | "Accepted" | "Expired" | "Revoked";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type InvitationFilters = {
  status: string;
  targetType: string;
  role: string;
  invitationId: string;
  mutation: string;
};

type InvitationRow = {
  id: string;
  email: string;
  targetType: TargetType;
  targetName: string;
  roleLabel: string;
  invitedBy: string | null;
  status: InvitationStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  note: string | null;
  lpName: string | null;
  storeOrganizationName: string | null;
};

type AdminInvitationsState =
  | {
      kind: "ready";
      adminName: string;
      filters: InvitationFilters;
      summary: SummaryItem[];
      rows: InvitationRow[];
      selectedInvitation: InvitationRow | null;
    }
  | {
      kind: "empty";
      adminName: string;
      filters: InvitationFilters;
      summary: SummaryItem[];
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "error";
      message: string;
    };

const STATUS_OPTIONS: InvitationStatus[] = [
  "PENDING",
  "ACCEPTED",
  "EXPIRED",
  "REVOKED",
];

const TARGET_TYPE_OPTIONS: TargetType[] = ["LP", "STORE_ORGANIZATION"];

const ROLE_OPTIONS = [
  "LP_ADMIN",
  "LP_MANAGER",
  "LP_VIEWER",
  "STORE_ORG_ADMIN",
  "STORE_ORG_MANAGER",
  "STORE_ORG_VIEWER",
] as const;

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

function buildInvitationsHref(
  filters: Omit<InvitationFilters, "mutation"> & { mutation?: string },
) {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.targetType) {
    params.set("targetType", filters.targetType);
  }

  if (filters.role) {
    params.set("role", filters.role);
  }

  if (filters.invitationId) {
    params.set("invitationId", filters.invitationId);
  }

  if (filters.mutation) {
    params.set("mutation", filters.mutation);
  }

  const query = params.toString();
  return query ? `/admin/invitations?${query}` : "/admin/invitations";
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

function getMutationBanner(mutation: string) {
  if (mutation === "revoked") {
    return {
      tone: "success" as const,
      message: "Invitation revoked successfully.",
    };
  }

  if (mutation === "invalid") {
    return {
      tone: "warning" as const,
      message: "The submitted invitation action was invalid.",
    };
  }

  if (mutation === "not_found") {
    return {
      tone: "warning" as const,
      message: "The selected invitation could not be found.",
    };
  }

  if (mutation === "not_pending") {
    return {
      tone: "warning" as const,
      message: "Only pending invitations can be revoked.",
    };
  }

  if (mutation === "forbidden") {
    return {
      tone: "warning" as const,
      message: "You are not authorized to manage invitations.",
    };
  }

  if (mutation === "error") {
    return {
      tone: "warning" as const,
      message: "The invitation action could not be completed. Try again shortly.",
    };
  }

  return null;
}

async function revokeInvitation(formData: FormData) {
  "use server";

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id || session.user.systemRole !== "ADMIN") {
    redirect(
      buildInvitationsHref({
        status: String(formData.get("statusFilter") || "").trim(),
        targetType: String(formData.get("targetTypeFilter") || "").trim(),
        role: String(formData.get("roleFilter") || "").trim(),
        invitationId: String(formData.get("invitationId") || "").trim(),
        mutation: "forbidden",
      }),
    );
  }

  const invitationId = String(formData.get("invitationId") || "").trim();
  const filters = {
    status: String(formData.get("statusFilter") || "").trim(),
    targetType: String(formData.get("targetTypeFilter") || "").trim(),
    role: String(formData.get("roleFilter") || "").trim(),
    invitationId,
  };

  if (!invitationId) {
    redirect(
      buildInvitationsHref({
        ...filters,
        mutation: "invalid",
      }),
    );
  }

  try {
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      select: { id: true, status: true },
    });

    if (!invitation) {
      redirect(
        buildInvitationsHref({
          ...filters,
          mutation: "not_found",
        }),
      );
    }

    if (invitation.status !== "PENDING") {
      redirect(
        buildInvitationsHref({
          ...filters,
          mutation: "not_pending",
        }),
      );
    }

    await prisma.invitation.update({
      where: { id: invitationId },
      data: {
        status: "REVOKED",
      },
    });

    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/invitations");

    redirect(
      buildInvitationsHref({
        ...filters,
        mutation: "revoked",
      }),
    );
  } catch (error) {
    console.error("Failed to revoke invitation", error);

    redirect(
      buildInvitationsHref({
        ...filters,
        mutation: "error",
      }),
    );
  }
}

async function getAdminInvitationsState(
  filters: InvitationFilters,
  adminName: string,
): Promise<AdminInvitationsState> {
  try {
    const statusFilter = STATUS_OPTIONS.includes(filters.status as InvitationStatus)
      ? (filters.status as InvitationStatus)
      : undefined;
    const targetTypeFilter = TARGET_TYPE_OPTIONS.includes(
      filters.targetType as TargetType,
    )
      ? (filters.targetType as TargetType)
      : undefined;
    const roleFilter = ROLE_OPTIONS.includes(filters.role as (typeof ROLE_OPTIONS)[number])
      ? filters.role
      : undefined;

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(targetTypeFilter === "LP"
        ? { lpId: { not: null } }
        : targetTypeFilter === "STORE_ORGANIZATION"
          ? { storeOrganizationId: { not: null } }
          : {}),
      ...(roleFilter
        ? roleFilter.startsWith("LP_")
          ? { lpRole: roleFilter as LpMembershipRole }
          : { storeOrgRole: roleFilter as StoreOrgMembershipRole }
        : {}),
    };

    const [pendingCount, acceptedCount, expiredCount, revokedCount, rows] =
      await Promise.all([
        prisma.invitation.count({
          where: { status: "PENDING" },
        }),
        prisma.invitation.count({
          where: { status: "ACCEPTED" },
        }),
        prisma.invitation.count({
          where: { status: "EXPIRED" },
        }),
        prisma.invitation.count({
          where: { status: "REVOKED" },
        }),
        prisma.invitation.findMany({
          where,
          orderBy: [{ createdAt: "desc" }],
          take: 50,
          select: {
            id: true,
            email: true,
            status: true,
            createdAt: true,
            expiresAt: true,
            acceptedAt: true,
            note: true,
            lpRole: true,
            storeOrgRole: true,
            invitedBy: {
              select: {
                name: true,
                email: true,
              },
            },
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
      ]);

    const summary: SummaryItem[] = [
      {
        label: "Pending",
        value: String(pendingCount),
        detail: "Invitations that are still waiting to be accepted, expired, or revoked.",
        tone: pendingCount > 0 ? "warning" : "success",
      },
      {
        label: "Accepted",
        value: String(acceptedCount),
        detail: "Invitations that have already been accepted by recipients.",
        tone: "success",
      },
      {
        label: "Expired",
        value: String(expiredCount),
        detail: "Invitations that passed their expiry window before acceptance.",
        tone: expiredCount > 0 ? "warning" : "neutral",
      },
      {
        label: "Revoked",
        value: String(revokedCount),
        detail: "Invitations manually revoked by an administrator.",
        tone: revokedCount > 0 ? "warning" : "neutral",
      },
    ];

    if (rows.length === 0) {
      return {
        kind: "empty",
        adminName,
        filters,
        summary,
      };
    }

    const mappedRows: InvitationRow[] = rows.map((row) => ({
      id: row.id,
      email: row.email,
      targetType: row.lp ? "LP" : "STORE_ORGANIZATION",
      targetName: row.lp?.name || row.storeOrganization?.name || "Not linked",
      roleLabel: formatEnumLabel(
        row.lpRole || row.storeOrgRole || "NOT_SPECIFIED",
      ),
      invitedBy: row.invitedBy?.name || row.invitedBy?.email || null,
      status: row.status,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      acceptedAt: row.acceptedAt,
      note: row.note,
      lpName: row.lp?.name || null,
      storeOrganizationName: row.storeOrganization?.name || null,
    }));

    const selectedInvitation =
      mappedRows.find((row) => row.id === filters.invitationId) ??
      mappedRows[0] ??
      null;

    return {
      kind: "ready",
      adminName,
      filters,
      summary,
      rows: mappedRows,
      selectedInvitation,
    };
  } catch (error) {
    console.error("Failed to load admin invitations", error);

    return {
      kind: "error",
      message:
        "We could not load invitations right now. Try again shortly or contact VendorStream support if the issue persists.",
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
          This invitation management surface is limited to VendorStream platform
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
          Invitations unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Invitations could not be loaded
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
}: Extract<AdminInvitationsState, { kind: "empty" }>) {
  const hasFilters = Boolean(filters.status || filters.targetType || filters.role);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Managing invitations as{" "}
        <span className="font-medium text-white">{adminName}</span>.
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <SummaryCard key={item.label} item={item} />
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No invitations found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No invitations match the current filter set."
              : "No invitations have been created yet."}
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
            <Link href="/admin/invitations">Reset filters</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminInvitationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    targetType?: string;
    role?: string;
    invitationId?: string;
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
              Admin Invitations
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Invitation management
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: InvitationFilters = {
    status: resolvedSearchParams?.status?.trim() ?? "",
    targetType: resolvedSearchParams?.targetType?.trim() ?? "",
    role: resolvedSearchParams?.role?.trim() ?? "",
    invitationId: resolvedSearchParams?.invitationId?.trim() ?? "",
    mutation: resolvedSearchParams?.mutation?.trim() ?? "",
  };

  const adminName = session.user.name?.trim() || "VendorStream Admin";
  const state = await getAdminInvitationsState(filters, adminName);
  const mutationBanner = getMutationBanner(filters.mutation);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin Invitations
            </div>
            <StatusBadge
              label="Admin"
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Invitation management
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review invitation activity across LP and store organization onboarding,
              inspect invitation details, and revoke pending invitations when needed.
            </p>
          </div>
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
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Managing invitations as{" "}
              <span className="font-medium text-white">{state.adminName}</span>.
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {state.summary.map((item) => (
                <SummaryCard key={item.label} item={item} />
              ))}
            </div>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg text-white">Filters</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Narrow invitations by status, target type, or invited role.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
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
                      {STATUS_OPTIONS.map((status) => (
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
                      htmlFor="targetType"
                      className="text-sm font-medium text-slate-200"
                    >
                      Target type
                    </label>
                    <select
                      id="targetType"
                      name="targetType"
                      defaultValue={state.filters.targetType}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All targets
                      </option>
                      {TARGET_TYPE_OPTIONS.map((targetType) => (
                        <option
                          key={targetType}
                          value={targetType}
                          className="bg-slate-950 text-white"
                        >
                          {formatEnumLabel(targetType)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="role"
                      className="text-sm font-medium text-slate-200"
                    >
                      Role
                    </label>
                    <select
                      id="role"
                      name="role"
                      defaultValue={state.filters.role}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All roles
                      </option>
                      {ROLE_OPTIONS.map((role) => (
                        <option
                          key={role}
                          value={role}
                          className="bg-slate-950 text-white"
                        >
                          {formatEnumLabel(role)}
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
                      <Link href="/admin/invitations">Reset</Link>
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
                      Invitations
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Real `Invitation` records with inviter, target, and invitation
                      status context.
                    </CardDescription>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                    <div className="font-medium text-white">Create invitation</div>
                    <div>
                      TODO: wire the invitation creation flow once token generation
                      and outbound invite delivery are implemented.
                    </div>
                    <div className="pt-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled
                        className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                      >
                        Create invitation
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
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium">
                          LP / store organization
                        </th>
                        <th className="px-4 py-3 font-medium">
                          LP role / store role
                        </th>
                        <th className="px-4 py-3 font-medium">Invited by</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Created at</th>
                        <th className="px-4 py-3 font-medium">Expires at</th>
                        <th className="px-4 py-3 font-medium">Accepted at</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-white/8 last:border-b-0 ${
                            row.id === state.selectedInvitation?.id
                              ? "bg-cyan-400/8"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-4 text-sm font-medium text-white">
                            {row.email}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.targetName}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.roleLabel}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.invitedBy ?? "Unknown inviter"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={formatEnumLabel(row.status)}
                              className={getInvitationTone(row.status)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.createdAt)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.expiresAt)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.acceptedAt)}
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
                                  href={buildInvitationsHref({
                                    ...state.filters,
                                    invitationId: row.id,
                                    mutation: undefined,
                                  })}
                                >
                                  View details
                                </Link>
                              </Button>

                              <form action={revokeInvitation}>
                                <input
                                  type="hidden"
                                  name="invitationId"
                                  value={row.id}
                                />
                                <input
                                  type="hidden"
                                  name="statusFilter"
                                  value={state.filters.status}
                                />
                                <input
                                  type="hidden"
                                  name="targetTypeFilter"
                                  value={state.filters.targetType}
                                />
                                <input
                                  type="hidden"
                                  name="roleFilter"
                                  value={state.filters.role}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                  disabled={row.status !== "PENDING"}
                                  className="border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20 disabled:text-slate-500"
                                >
                                  Revoke
                                </Button>
                              </form>

                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled
                                className="text-slate-300 disabled:text-slate-500"
                              >
                                Resend
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

            {state.selectedInvitation ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Invitation details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Inspect the target company, invited role, and invitation
                      timeline for the selected record.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow label="Invitation ID" value={state.selectedInvitation.id} />
                    <DetailRow label="Email" value={state.selectedInvitation.email} />
                    <DetailRow
                      label="Target type"
                      value={formatEnumLabel(state.selectedInvitation.targetType)}
                    />
                    <DetailRow
                      label="Target"
                      value={state.selectedInvitation.targetName}
                    />
                    <DetailRow
                      label="Role"
                      value={state.selectedInvitation.roleLabel}
                    />
                    <DetailRow
                      label="Invited by"
                      value={
                        state.selectedInvitation.invitedBy ?? "Unknown inviter"
                      }
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusBadge
                          label={formatEnumLabel(state.selectedInvitation.status)}
                          className={getInvitationTone(
                            state.selectedInvitation.status,
                          )}
                        />
                      }
                    />
                    <DetailRow
                      label="Created at"
                      value={formatDateTime(state.selectedInvitation.createdAt)}
                    />
                    <DetailRow
                      label="Expires at"
                      value={formatDateTime(state.selectedInvitation.expiresAt)}
                    />
                    <DetailRow
                      label="Accepted at"
                      value={formatDateTime(state.selectedInvitation.acceptedAt)}
                    />
                    <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Invitation note
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-300">
                        {state.selectedInvitation.note ??
                          "No invitation note has been recorded."}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Invitation actions
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Revoke pending invitations now. Resend and create flows can
                        be connected once outbound invitation delivery is wired.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <form action={revokeInvitation}>
                        <input
                          type="hidden"
                          name="invitationId"
                          value={state.selectedInvitation.id}
                        />
                        <input
                          type="hidden"
                          name="statusFilter"
                          value={state.filters.status}
                        />
                        <input
                          type="hidden"
                          name="targetTypeFilter"
                          value={state.filters.targetType}
                        />
                        <input
                          type="hidden"
                          name="roleFilter"
                          value={state.filters.role}
                        />
                        <Button
                          type="submit"
                          disabled={state.selectedInvitation.status !== "PENDING"}
                          className="w-full bg-red-500 text-white hover:bg-red-400 disabled:bg-white/20 disabled:text-slate-400"
                        >
                          Revoke invitation
                        </Button>
                      </form>

                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Resend invitation
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Create invitation
                      </Button>

                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: connect invitation creation and resend flows once
                        token issuance, email delivery, and onboarding handoff are
                        implemented.
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Create invitation
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Use the future invitation creation flow to issue new LP or
                        store organization onboarding access.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                        Invitation creation is not yet wired in this repo. The
                        canonical future route is `/admin/invitations/new`.
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
