import Link from "next/link";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  prisma,
  type AccessRequestStatus,
  type AccessRequestType,
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
  label: "Total Requests" | "Pending Review" | "Approved" | "Rejected";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type AccessRequestFilters = {
  status: string;
  requestType: string;
  submittedDate: string;
  requestId: string;
  mutation: string;
};

type AccessRequestRow = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  type: AccessRequestType;
  requestedCompanyName: string | null;
  targetName: string;
  status: AccessRequestStatus;
  submittedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  message: string | null;
  lpName: string | null;
  storeOrganizationName: string | null;
};

type AdminAccessRequestsState =
  | {
      kind: "ready";
      adminName: string;
      filters: AccessRequestFilters;
      summary: SummaryItem[];
      rows: AccessRequestRow[];
      selectedRequest: AccessRequestRow | null;
    }
  | {
      kind: "empty";
      adminName: string;
      filters: AccessRequestFilters;
      summary: SummaryItem[];
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "error";
      message: string;
    };

const STATUS_OPTIONS: AccessRequestStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELED",
];

const REQUEST_TYPE_OPTIONS: AccessRequestType[] = ["LP_ACCESS", "STORE_ORG_ACCESS"];

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

function parseSubmittedDateFilter(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const start = new Date(`${value}T00:00:00.000Z`);
  const end = new Date(`${value}T23:59:59.999Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  return { start, end };
}

function buildAccessRequestsHref(
  filters: Omit<AccessRequestFilters, "mutation"> & { mutation?: string },
) {
  const params = new URLSearchParams();

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.requestType) {
    params.set("requestType", filters.requestType);
  }

  if (filters.submittedDate) {
    params.set("submittedDate", filters.submittedDate);
  }

  if (filters.requestId) {
    params.set("requestId", filters.requestId);
  }

  if (filters.mutation) {
    params.set("mutation", filters.mutation);
  }

  const query = params.toString();
  return query ? `/admin/access-requests?${query}` : "/admin/access-requests";
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
  if (mutation === "approved") {
    return {
      tone: "success" as const,
      message: "Access request approved and review metadata saved.",
    };
  }

  if (mutation === "rejected") {
    return {
      tone: "success" as const,
      message: "Access request rejected and review metadata saved.",
    };
  }

  if (mutation === "notes_saved") {
    return {
      tone: "neutral" as const,
      message: "Review notes were saved.",
    };
  }

  if (mutation === "invalid") {
    return {
      tone: "warning" as const,
      message: "The submitted review action was invalid.",
    };
  }

  if (mutation === "not_found") {
    return {
      tone: "warning" as const,
      message: "The selected access request could not be found.",
    };
  }

  if (mutation === "forbidden") {
    return {
      tone: "warning" as const,
      message: "You are not authorized to review access requests.",
    };
  }

  if (mutation === "error") {
    return {
      tone: "warning" as const,
      message: "The review action could not be completed. Try again shortly.",
    };
  }

  return null;
}

async function reviewAccessRequest(formData: FormData) {
  "use server";

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id || session.user.systemRole !== "ADMIN") {
    redirect(
      buildAccessRequestsHref({
        status: String(formData.get("statusFilter") || "").trim(),
        requestType: String(formData.get("requestTypeFilter") || "").trim(),
        submittedDate: String(formData.get("submittedDateFilter") || "").trim(),
        requestId: String(formData.get("requestId") || "").trim(),
        mutation: "forbidden",
      }),
    );
  }

  const requestId = String(formData.get("requestId") || "").trim();
  const decision = String(formData.get("decision") || "").trim();
  const reviewNotes = String(formData.get("reviewNotes") || "").trim() || null;

  const filters = {
    status: String(formData.get("statusFilter") || "").trim(),
    requestType: String(formData.get("requestTypeFilter") || "").trim(),
    submittedDate: String(formData.get("submittedDateFilter") || "").trim(),
    requestId,
  };

  if (!requestId || !["APPROVED", "REJECTED", "NOTES_ONLY"].includes(decision)) {
    redirect(
      buildAccessRequestsHref({
        ...filters,
        mutation: "invalid",
      }),
    );
  }

  try {
    const existingRequest = await prisma.accessRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });

    if (!existingRequest) {
      redirect(
        buildAccessRequestsHref({
          ...filters,
          mutation: "not_found",
        }),
      );
    }

    await prisma.accessRequest.update({
      where: { id: requestId },
      data:
        decision === "NOTES_ONLY"
          ? {
              reviewNotes,
            }
          : {
              status: decision as AccessRequestStatus,
              reviewNotes,
              reviewedByUserId: session.user.id,
              reviewedAt: new Date(),
            },
    });

    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/access-requests");

    redirect(
      buildAccessRequestsHref({
        ...filters,
        mutation:
          decision === "NOTES_ONLY"
            ? "notes_saved"
            : decision === "APPROVED"
              ? "approved"
              : "rejected",
      }),
    );
  } catch (error) {
    console.error("Failed to review access request", error);

    redirect(
      buildAccessRequestsHref({
        ...filters,
        mutation: "error",
      }),
    );
  }
}

async function getAdminAccessRequestsState(
  filters: AccessRequestFilters,
  adminName: string,
): Promise<AdminAccessRequestsState> {
  try {
    const submittedDateRange = parseSubmittedDateFilter(filters.submittedDate);
    const statusFilter = STATUS_OPTIONS.includes(filters.status as AccessRequestStatus)
      ? (filters.status as AccessRequestStatus)
      : undefined;
    const requestTypeFilter = REQUEST_TYPE_OPTIONS.includes(
      filters.requestType as AccessRequestType,
    )
      ? (filters.requestType as AccessRequestType)
      : undefined;

    const where = {
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(requestTypeFilter ? { type: requestTypeFilter } : {}),
      ...(submittedDateRange
        ? {
            submittedAt: {
              gte: submittedDateRange.start,
              lte: submittedDateRange.end,
            },
          }
        : {}),
    };

    const [
      totalCount,
      pendingCount,
      approvedCount,
      rejectedCount,
      rows,
    ] = await Promise.all([
      prisma.accessRequest.count(),
      prisma.accessRequest.count({
        where: { status: "PENDING" },
      }),
      prisma.accessRequest.count({
        where: { status: "APPROVED" },
      }),
      prisma.accessRequest.count({
        where: { status: "REJECTED" },
      }),
      prisma.accessRequest.findMany({
        where,
        orderBy: [{ submittedAt: "desc" }],
        take: 50,
        select: {
          id: true,
          requesterName: true,
          requesterEmail: true,
          type: true,
          requestedCompanyName: true,
          status: true,
          message: true,
          reviewNotes: true,
          submittedAt: true,
          reviewedAt: true,
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
          reviewedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
    ]);

    const summary: SummaryItem[] = [
      {
        label: "Total Requests",
        value: String(totalCount),
        detail: "All access requests recorded across LP and store organization onboarding.",
        tone: "neutral",
      },
      {
        label: "Pending Review",
        value: String(pendingCount),
        detail: "Requests currently awaiting an administrator decision.",
        tone: pendingCount > 0 ? "warning" : "success",
      },
      {
        label: "Approved",
        value: String(approvedCount),
        detail: "Requests that have already been approved for downstream access provisioning.",
        tone: "success",
      },
      {
        label: "Rejected",
        value: String(rejectedCount),
        detail: "Requests that were rejected after administrator review.",
        tone: rejectedCount > 0 ? "warning" : "neutral",
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

    const mappedRows: AccessRequestRow[] = rows.map((row) => ({
      id: row.id,
      requesterName: row.requesterName,
      requesterEmail: row.requesterEmail,
      type: row.type,
      requestedCompanyName: row.requestedCompanyName,
      targetName: row.lp?.name || row.storeOrganization?.name || "Not linked",
      status: row.status,
      submittedAt: row.submittedAt,
      reviewedBy: row.reviewedBy?.name || row.reviewedBy?.email || null,
      reviewedAt: row.reviewedAt,
      reviewNotes: row.reviewNotes,
      message: row.message,
      lpName: row.lp?.name || null,
      storeOrganizationName: row.storeOrganization?.name || null,
    }));

    const selectedRequest =
      mappedRows.find((row) => row.id === filters.requestId) ?? mappedRows[0] ?? null;

    return {
      kind: "ready",
      adminName,
      filters,
      summary,
      rows: mappedRows,
      selectedRequest,
    };
  } catch (error) {
    console.error("Failed to load admin access requests", error);

    return {
      kind: "error",
      message:
        "We could not load access requests right now. Try again shortly or contact VendorStream support if the issue persists.",
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
          This review surface is limited to VendorStream platform administrators.
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
          Access requests unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Access requests could not be loaded
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
}: Extract<AdminAccessRequestsState, { kind: "empty" }>) {
  const hasFilters = Boolean(
    filters.status || filters.requestType || filters.submittedDate,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Reviewing access requests as{" "}
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
            No access requests found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No access requests match the current filter set."
              : "No access requests have been submitted yet."}
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
            <Link href="/admin/access-requests">Reset filters</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AdminAccessRequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    requestType?: string;
    submittedDate?: string;
    requestId?: string;
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
              Admin Access Requests
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Access request review
              </h1>
            </div>
          </header>
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: AccessRequestFilters = {
    status: resolvedSearchParams?.status?.trim() ?? "",
    requestType: resolvedSearchParams?.requestType?.trim() ?? "",
    submittedDate: resolvedSearchParams?.submittedDate?.trim() ?? "",
    requestId: resolvedSearchParams?.requestId?.trim() ?? "",
    mutation: resolvedSearchParams?.mutation?.trim() ?? "",
  };

  const adminName = session.user.name?.trim() || "VendorStream Admin";
  const state = await getAdminAccessRequestsState(filters, adminName);
  const mutationBanner = getMutationBanner(filters.mutation);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Admin Access Requests
            </div>
            <StatusBadge
              label="Admin"
              className="border-white/10 bg-white/5 text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Access request review
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review inbound LP and store organization access requests, inspect
              request detail, and record administrator decisions.
            </p>
          </div>
        </header>

        {mutationBanner ? (
          <div
            className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${
              mutationBanner.tone === "success"
                ? "border-emerald-400/20 bg-emerald-500/8 text-emerald-100"
                : mutationBanner.tone === "warning"
                  ? "border-amber-400/20 bg-amber-500/8 text-amber-100"
                  : "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
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
              Reviewing access requests as{" "}
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
                  Narrow access requests by review status, request type, or the
                  exact submitted day.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr_auto]">
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
                      htmlFor="requestType"
                      className="text-sm font-medium text-slate-200"
                    >
                      Request type
                    </label>
                    <select
                      id="requestType"
                      name="requestType"
                      defaultValue={state.filters.requestType}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All request types
                      </option>
                      {REQUEST_TYPE_OPTIONS.map((requestType) => (
                        <option
                          key={requestType}
                          value={requestType}
                          className="bg-slate-950 text-white"
                        >
                          {formatEnumLabel(requestType)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="submittedDate"
                      className="text-sm font-medium text-slate-200"
                    >
                      Submitted date
                    </label>
                    <input
                      id="submittedDate"
                      name="submittedDate"
                      type="date"
                      defaultValue={state.filters.submittedDate}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    />
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
                      <Link href="/admin/access-requests">Reset</Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Access requests
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real `AccessRequest` records with current review state and linked
                  LP or store organization context.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="border-b border-white/8 bg-white/5">
                      <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-4 py-3 font-medium">Requester name</th>
                        <th className="px-4 py-3 font-medium">Requester email</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">
                          Requested company name
                        </th>
                        <th className="px-4 py-3 font-medium">
                          LP / store organization
                        </th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Submitted at</th>
                        <th className="px-4 py-3 font-medium">Reviewed by</th>
                        <th className="px-4 py-3 font-medium">Reviewed at</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-white/8 last:border-b-0 ${
                            row.id === state.selectedRequest?.id
                              ? "bg-cyan-400/8"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-4 text-sm font-medium text-white">
                            {row.requesterName}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.requesterEmail}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatEnumLabel(row.type)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.requestedCompanyName ?? "Not specified"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.targetName}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={formatEnumLabel(row.status)}
                              className={getAccessRequestTone(row.status)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.submittedAt)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.reviewedBy ?? "Not reviewed"}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.reviewedAt)}
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
                                  href={buildAccessRequestsHref({
                                    ...state.filters,
                                    requestId: row.id,
                                    mutation: undefined,
                                  })}
                                >
                                  Open details
                                </Link>
                              </Button>

                              <form action={reviewAccessRequest}>
                                <input type="hidden" name="requestId" value={row.id} />
                                <input
                                  type="hidden"
                                  name="statusFilter"
                                  value={state.filters.status}
                                />
                                <input
                                  type="hidden"
                                  name="requestTypeFilter"
                                  value={state.filters.requestType}
                                />
                                <input
                                  type="hidden"
                                  name="submittedDateFilter"
                                  value={state.filters.submittedDate}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  name="decision"
                                  value="APPROVED"
                                  className="bg-emerald-500 text-white hover:bg-emerald-400"
                                >
                                  Approve
                                </Button>
                              </form>

                              <form action={reviewAccessRequest}>
                                <input type="hidden" name="requestId" value={row.id} />
                                <input
                                  type="hidden"
                                  name="statusFilter"
                                  value={state.filters.status}
                                />
                                <input
                                  type="hidden"
                                  name="requestTypeFilter"
                                  value={state.filters.requestType}
                                />
                                <input
                                  type="hidden"
                                  name="submittedDateFilter"
                                  value={state.filters.submittedDate}
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  name="decision"
                                  value="REJECTED"
                                  variant="outline"
                                  className="border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                                >
                                  Reject
                                </Button>
                              </form>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {state.selectedRequest ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Request details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Review the current request context, source company details,
                      and any previous review notes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow label="Request ID" value={state.selectedRequest.id} />
                    <DetailRow
                      label="Requester"
                      value={state.selectedRequest.requesterName}
                    />
                    <DetailRow
                      label="Requester email"
                      value={state.selectedRequest.requesterEmail}
                    />
                    <DetailRow
                      label="Request type"
                      value={formatEnumLabel(state.selectedRequest.type)}
                    />
                    <DetailRow
                      label="Requested company name"
                      value={
                        state.selectedRequest.requestedCompanyName ??
                        "Not specified"
                      }
                    />
                    <DetailRow
                      label="Linked LP"
                      value={state.selectedRequest.lpName ?? "Not linked"}
                    />
                    <DetailRow
                      label="Linked store organization"
                      value={
                        state.selectedRequest.storeOrganizationName ??
                        "Not linked"
                      }
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusBadge
                          label={formatEnumLabel(state.selectedRequest.status)}
                          className={getAccessRequestTone(
                            state.selectedRequest.status,
                          )}
                        />
                      }
                    />
                    <DetailRow
                      label="Submitted at"
                      value={formatDateTime(state.selectedRequest.submittedAt)}
                    />
                    <DetailRow
                      label="Reviewed by"
                      value={state.selectedRequest.reviewedBy ?? "Not reviewed"}
                    />
                    <DetailRow
                      label="Reviewed at"
                      value={formatDateTime(state.selectedRequest.reviewedAt)}
                    />
                    <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Request message
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-300">
                        {state.selectedRequest.message ??
                          "No requester message was provided."}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Review notes
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-300">
                        {state.selectedRequest.reviewNotes ??
                          "No review notes have been added yet."}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Review actions
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Record a review note, then approve or reject the selected
                      access request.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form action={reviewAccessRequest} className="space-y-4">
                      <input
                        type="hidden"
                        name="requestId"
                        value={state.selectedRequest.id}
                      />
                      <input
                        type="hidden"
                        name="statusFilter"
                        value={state.filters.status}
                      />
                      <input
                        type="hidden"
                        name="requestTypeFilter"
                        value={state.filters.requestType}
                      />
                      <input
                        type="hidden"
                        name="submittedDateFilter"
                        value={state.filters.submittedDate}
                      />

                      <div className="space-y-2">
                        <label
                          htmlFor="reviewNotes"
                          className="text-sm font-medium text-slate-200"
                        >
                          Review notes
                        </label>
                        <textarea
                          id="reviewNotes"
                          name="reviewNotes"
                          defaultValue={state.selectedRequest.reviewNotes ?? ""}
                          rows={8}
                          placeholder="Add approval rationale, rejection context, or onboarding notes."
                          className="w-full rounded-md border border-white/10 bg-slate-950/60 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                        />
                      </div>

                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: after approval or rejection, this flow can be extended
                        to create membership assignments, invitation handoff, or
                        downstream onboarding notifications.
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <Button
                          type="submit"
                          name="decision"
                          value="APPROVED"
                          className="bg-emerald-500 text-white hover:bg-emerald-400"
                        >
                          Approve
                        </Button>
                        <Button
                          type="submit"
                          name="decision"
                          value="REJECTED"
                          variant="outline"
                          className="border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20"
                        >
                          Reject
                        </Button>
                        <Button
                          type="submit"
                          name="decision"
                          value="NOTES_ONLY"
                          variant="outline"
                          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                        >
                          Add review notes
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
