import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  Prisma,
  type NotificationStatus,
  type NotificationType,
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

type NotificationFilters = {
  type: string;
  status: string;
  notificationId: string;
};

type NotificationRow = {
  id: string;
  type: NotificationType;
  subject: string;
  email: string;
  status: NotificationStatus;
  sentAt: Date | null;
  createdAt: Date;
  providerMessageId: string | null;
  payload: Prisma.JsonValue | null;
  scopeSource: "userId" | "email";
};

type NotificationsState =
  | {
      kind: "ready";
      viewerLabel: string;
      filters: NotificationFilters;
      totalCount: number;
      matchingCount: number;
      emailFallbackCount: number;
      rows: NotificationRow[];
      selectedNotification: NotificationRow | null;
    }
  | {
      kind: "empty";
      viewerLabel: string;
      filters: NotificationFilters;
      totalCount: number;
      matchingCount: number;
      emailFallbackCount: number;
    }
  | {
      kind: "error";
      message: string;
    };

const NOTIFICATION_TYPE_OPTIONS: NotificationType[] = [
  "INVITATION",
  "ACCESS_REQUEST_DECISION",
  "MISSING_UPLOAD_REMINDER",
  "MISMATCH_ASSIGNED",
  "MISMATCH_RESOLVED",
  "STATEMENT_READY",
  "SYSTEM_ALERT",
];

const NOTIFICATION_STATUS_OPTIONS: NotificationStatus[] = [
  "PENDING",
  "SENT",
  "FAILED",
];

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

function formatEnumLabel(value: string) {
  return value.replaceAll("_", " ");
}

function buildNotificationsHref(filters: NotificationFilters) {
  const params = new URLSearchParams();

  if (filters.type) {
    params.set("type", filters.type);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.notificationId) {
    params.set("notificationId", filters.notificationId);
  }

  const query = params.toString();
  return query ? `/notifications?${query}` : "/notifications";
}

function getStatusTone(status: NotificationStatus) {
  if (status === "SENT") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "PENDING") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function formatPayload(payload: Prisma.JsonValue | null) {
  if (payload === null) {
    return "No payload recorded.";
  }

  return JSON.stringify(payload, null, 2);
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

async function getNotificationsState({
  userId,
  email,
  viewerLabel,
  filters,
}: {
  userId?: string;
  email?: string;
  viewerLabel: string;
  filters: NotificationFilters;
}): Promise<NotificationsState> {
  try {
    const normalizedEmail = email?.trim().toLowerCase() ?? "";
    const typeFilter = NOTIFICATION_TYPE_OPTIONS.includes(
      filters.type as NotificationType,
    )
      ? (filters.type as NotificationType)
      : undefined;
    const statusFilter = NOTIFICATION_STATUS_OPTIONS.includes(
      filters.status as NotificationStatus,
    )
      ? (filters.status as NotificationStatus)
      : undefined;

    const scopeClauses: Array<
      Prisma.NotificationWhereInput | undefined
    > = [
      userId ? { userId } : undefined,
      normalizedEmail ? { email: normalizedEmail } : undefined,
    ];

    const scopedOrClauses = scopeClauses.filter(
      (clause): clause is Prisma.NotificationWhereInput => Boolean(clause),
    );

    if (scopedOrClauses.length === 0) {
      return {
        kind: "error",
        message:
          "We could not determine your notification scope. Sign in again and retry.",
      };
    }

    const scopedWhere: Prisma.NotificationWhereInput =
      scopedOrClauses.length === 1 ? scopedOrClauses[0] : { OR: scopedOrClauses };

    const where: Prisma.NotificationWhereInput = {
      AND: [
        scopedWhere,
        ...(typeFilter ? [{ type: typeFilter }] : []),
        ...(statusFilter ? [{ status: statusFilter }] : []),
      ],
    };

    const [totalCount, matchingCount, emailFallbackCount, rows] = await Promise.all([
      prisma.notification.count({
        where: scopedWhere,
      }),
      prisma.notification.count({ where }),
      normalizedEmail
        ? prisma.notification.count({
            where: {
              email: normalizedEmail,
              userId: null,
            },
          })
        : 0,
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          type: true,
          subject: true,
          email: true,
          status: true,
          sentAt: true,
          createdAt: true,
          providerMessageId: true,
          payload: true,
          userId: true,
        },
      }),
    ]);

    if (rows.length === 0) {
      return {
        kind: "empty",
        viewerLabel,
        filters,
        totalCount,
        matchingCount,
        emailFallbackCount,
      };
    }

    const mappedRows: NotificationRow[] = rows.map((row) => ({
      id: row.id,
      type: row.type,
      subject: row.subject,
      email: row.email,
      status: row.status,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
      providerMessageId: row.providerMessageId,
      payload: row.payload,
      scopeSource: row.userId ? "userId" : "email",
    }));

    const selectedNotification =
      mappedRows.find((row) => row.id === filters.notificationId) ??
      mappedRows[0] ??
      null;

    return {
      kind: "ready",
      viewerLabel,
      filters,
      totalCount,
      matchingCount,
      emailFallbackCount,
      rows: mappedRows,
      selectedNotification,
    };
  } catch (error) {
    console.error("Failed to load notifications", error);

    return {
      kind: "error",
      message:
        "We could not load notification activity right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Notifications unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Notification inbox could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
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

function EmptyState({
  viewerLabel,
  filters,
  totalCount,
  matchingCount,
  emailFallbackCount,
}: Extract<NotificationsState, { kind: "empty" }>) {
  const hasFilters = Boolean(filters.type || filters.status);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Viewing notifications for{" "}
        <span className="font-medium text-white">{viewerLabel}</span>. Showing{" "}
        <span className="font-medium text-white">{matchingCount}</span> matches
        across <span className="font-medium text-white">{totalCount}</span> total
        records.
      </div>

      {emailFallbackCount > 0 ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
          Some notifications are matched by email because `Notification.userId`
          is not populated on every record yet.
          <span className="font-medium text-white">
            {" "}
            TODO: backfill notification user linkage for fully user-scoped inbox
            reads.
          </span>
        </div>
      ) : null}

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-lg text-white">Filters</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Narrow notification activity by type or delivery status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 xl:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2">
              <label htmlFor="type" className="text-sm font-medium text-slate-200">
                Type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={filters.type}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All types
                </option>
                {NOTIFICATION_TYPE_OPTIONS.map((type) => (
                  <option
                    key={type}
                    value={type}
                    className="bg-slate-950 text-white"
                  >
                    {formatEnumLabel(type)}
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
                defaultValue={filters.status}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All statuses
                </option>
                {NOTIFICATION_STATUS_OPTIONS.map((status) => (
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
                <Link
                  href={buildNotificationsHref({
                    type: "",
                    status: "",
                    notificationId: "",
                  })}
                >
                  Reset
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No notifications found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {hasFilters
              ? "No notifications match the current filter set."
              : "No notifications are currently available for this account."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link
              href={buildNotificationsHref({
                type: "",
                status: "",
                notificationId: "",
              })}
            >
              Reset filters
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    type?: string;
    status?: string;
    notificationId?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: NotificationFilters = {
    type: resolvedSearchParams?.type?.trim() ?? "",
    status: resolvedSearchParams?.status?.trim() ?? "",
    notificationId: resolvedSearchParams?.notificationId?.trim() ?? "",
  };

  const viewerLabel =
    session.user.name?.trim() || session.user.email?.trim() || "VendorStream User";

  const state = await getNotificationsState({
    userId: session.user.id,
    email: session.user.email,
    viewerLabel,
    filters,
  });

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            Notifications
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Notification inbox
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review delivery activity across invitations, access decisions,
              upload reminders, mismatch workflow updates, statements, and system
              alerts.
            </p>
          </div>
          {"totalCount" in state ? (
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
              Viewing notifications for{" "}
              <span className="font-medium text-white">{state.viewerLabel}</span>.
              Showing{" "}
              <span className="font-medium text-white">{state.matchingCount}</span>{" "}
              matches out of{" "}
              <span className="font-medium text-white">{state.totalCount}</span>{" "}
              total records.
            </div>
          ) : null}
          {"emailFallbackCount" in state && state.emailFallbackCount > 0 ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-100">
              Some notifications are scoped by email because `Notification.userId`
              is still incomplete on older records.
              <span className="font-medium text-white">
                {" "}
                TODO: backfill user linkage to eliminate email fallback reads.
              </span>
            </div>
          ) : null}
        </header>

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? <EmptyState {...state} /> : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg text-white">Filters</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Narrow notification activity by type or delivery status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 xl:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-2">
                    <label
                      htmlFor="type"
                      className="text-sm font-medium text-slate-200"
                    >
                      Type
                    </label>
                    <select
                      id="type"
                      name="type"
                      defaultValue={state.filters.type}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All types
                      </option>
                      {NOTIFICATION_TYPE_OPTIONS.map((type) => (
                        <option
                          key={type}
                          value={type}
                          className="bg-slate-950 text-white"
                        >
                          {formatEnumLabel(type)}
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
                      {NOTIFICATION_STATUS_OPTIONS.map((status) => (
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
                      <Link
                        href={buildNotificationsHref({
                          type: "",
                          status: "",
                          notificationId: "",
                        })}
                      >
                        Reset
                      </Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Notifications
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real `Notification` records scoped to the current account by
                  user ID where available, with email fallback for legacy records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="border-b border-white/8 bg-white/5">
                      <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Subject</th>
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Sent at</th>
                        <th className="px-4 py-3 font-medium">Created at</th>
                        <th className="px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.map((row) => (
                        <tr
                          key={row.id}
                          className={`border-b border-white/8 last:border-b-0 ${
                            row.id === state.selectedNotification?.id
                              ? "bg-cyan-400/8"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatEnumLabel(row.type)}
                          </td>
                          <td className="max-w-[22rem] px-4 py-4 text-sm font-medium text-white">
                            {row.subject}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {row.email}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            <StatusBadge
                              label={formatEnumLabel(row.status)}
                              className={getStatusTone(row.status)}
                            />
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.sentAt)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatDateTime(row.createdAt)}
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
                                  href={buildNotificationsHref({
                                    type: state.filters.type,
                                    status: state.filters.status,
                                    notificationId: row.id,
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
                                Mark read
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled
                                className="text-slate-300 disabled:text-slate-500"
                              >
                                Retry
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

            {state.selectedNotification ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Notification details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Review delivery metadata and the scoped source used to surface
                      this notification in the inbox.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow label="Notification ID" value={state.selectedNotification.id} />
                    <DetailRow
                      label="Type"
                      value={formatEnumLabel(state.selectedNotification.type)}
                    />
                    <DetailRow
                      label="Subject"
                      value={state.selectedNotification.subject}
                    />
                    <DetailRow
                      label="Email"
                      value={state.selectedNotification.email}
                    />
                    <DetailRow
                      label="Status"
                      value={
                        <StatusBadge
                          label={formatEnumLabel(state.selectedNotification.status)}
                          className={getStatusTone(state.selectedNotification.status)}
                        />
                      }
                    />
                    <DetailRow
                      label="Sent at"
                      value={formatDateTime(state.selectedNotification.sentAt)}
                    />
                    <DetailRow
                      label="Created at"
                      value={formatDateTime(state.selectedNotification.createdAt)}
                    />
                    <DetailRow
                      label="Provider message ID"
                      value={
                        state.selectedNotification.providerMessageId ||
                        "Not available"
                      }
                    />
                    <DetailRow
                      label="Scope source"
                      value={
                        state.selectedNotification.scopeSource === "userId"
                          ? "User-linked record"
                          : "Email fallback record"
                      }
                    />
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Notification payload
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Raw notification payload captured at send time.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <pre className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4 text-xs leading-6 text-slate-300">
                        {formatPayload(state.selectedNotification.payload)}
                      </pre>
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Inbox actions
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Delivery visibility is available now. Read-state and retry
                        actions can be connected when the notification model and
                        mutation routes are expanded.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Button
                        type="button"
                        disabled
                        className="w-full bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                      >
                        Mark notification as read
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Retry failed notification
                      </Button>
                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: add notification read-state tracking and failed-send
                        retry mutations once the delivery workflow model supports
                        them.
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
