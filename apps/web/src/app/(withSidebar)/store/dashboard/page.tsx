import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  prisma,
  type CycleStatus,
  type ImportBatchStatus,
  type StatementStatus,
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
import { formatMonthLabel } from "@/lib/format";

type DashboardSummary = {
  label:
    | "Active Cycles"
    | "Pending Store Uploads"
    | "Open Mismatches"
    | "Ready Statements";
  value: string;
  detail: string;
  tone: "neutral" | "warning" | "success";
};

type RecentCycleRow = {
  id: string;
  monthLabel: string;
  lpName: string;
  storeLocation: string;
  cycleStatus: CycleStatus;
  mismatchCount: number;
  statementStatus: "PENDING" | "DRAFT" | "READY" | "FAILED";
};

type RecentUploadRow = {
  id: string;
  monthLabel: string;
  storeLocation: string;
  fileName: string;
  uploadedAt: Date | null;
  status: ImportBatchStatus;
};

type StoreDashboardState =
  | {
      kind: "ready";
      userName: string;
      context: {
        primaryStoreOrganizationName: string;
        totalStoreOrganizations: number;
        totalLocations: number;
        isFallbackContext: boolean;
      };
      summary: DashboardSummary[];
      recentCycles: RecentCycleRow[];
      recentUploads: RecentUploadRow[];
    }
  | {
      kind: "empty";
      userName: string;
      isAdminPreview: boolean;
    }
  | {
      kind: "error";
      userName: string;
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

function formatMonth(date: Date) {
  return formatMonthLabel(date);
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

function formatCycleStatus(value: CycleStatus) {
  return value.replaceAll("_", " ");
}

function formatUploadStatus(value: ImportBatchStatus) {
  return value.replaceAll("_", " ");
}

function getCycleTone(status: CycleStatus) {
  if (status === "STATEMENT_READY" || status === "RECONCILIATION_PASSED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "MISMATCHES_FOUND" || status === "AWAITING_UPLOADS") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getUploadTone(status: ImportBatchStatus) {
  if (status === "RECONCILED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (
    status === "FAILED" ||
    status === "VALIDATION_FAILED" ||
    status === "PREVALIDATION_FAILED" ||
    status === "CANCELED"
  ) {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (
    status === "RECEIVED" ||
    status === "VALIDATING" ||
    status === "WAITING_FOR_COUNTERPART"
  ) {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getStatementTone(status: RecentCycleRow["statementStatus"]) {
  if (status === "READY") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "FAILED") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }

  if (status === "DRAFT") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function mapStatementStatus(
  status: StatementStatus | undefined,
): RecentCycleRow["statementStatus"] {
  if (status === "FINAL") {
    return "READY";
  }

  if (status === "FAILED") {
    return "FAILED";
  }

  if (status === "DRAFT") {
    return "DRAFT";
  }

  return "PENDING";
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

async function getStoreDashboardState(): Promise<StoreDashboardState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const userName = session.user.name?.trim() || "VendorStream User";
  const userId = session.user.id;
  const isAdmin = session.user.systemRole === "ADMIN";

  if (!userId) {
    return {
      kind: "error",
      userName,
      message:
        "Your session is missing a user identifier. Re-authenticate and try again.",
    };
  }

  try {
    const memberships = await prisma.storeOrgMembership.findMany({
      where: { userId },
      include: {
        storeOrganization: {
          include: {
            locations: {
              where: { isActive: true },
              select: {
                id: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    let scopedStoreOrganizations = memberships.map((membership) => ({
      id: membership.storeOrganization.id,
      name: membership.storeOrganization.name,
      locationIds: membership.storeOrganization.locations.map(
        (location) => location.id,
      ),
    }));
    let isFallbackContext = false;

    if (scopedStoreOrganizations.length === 0 && isAdmin) {
      const fallbackStoreOrganization = await prisma.storeOrganization.findFirst({
        where: { isActive: true },
        include: {
          locations: {
            where: { isActive: true },
            select: {
              id: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      if (fallbackStoreOrganization) {
        scopedStoreOrganizations = [
          {
            id: fallbackStoreOrganization.id,
            name: fallbackStoreOrganization.name,
            locationIds: fallbackStoreOrganization.locations.map(
              (location) => location.id,
            ),
          },
        ];
        isFallbackContext = true;
      }
    }

    if (scopedStoreOrganizations.length === 0) {
      return {
        kind: "empty",
        userName,
        isAdminPreview: isAdmin,
      };
    }

    const storeOrganizationIds = scopedStoreOrganizations.map((org) => org.id);
    const primaryStoreOrganizationName = scopedStoreOrganizations[0]?.name ?? "Store Organization";
    const totalLocations = scopedStoreOrganizations.reduce(
      (sum, org) => sum + org.locationIds.length,
      0,
    );

    const [activeCyclesCount, pendingStoreUploadsCount, openMismatchesCount, readyStatementsCount, recentCycles, recentUploads] =
      await Promise.all([
        prisma.reconciliationCycle.count({
          where: {
            storeLocation: {
              storeOrganizationId: {
                in: storeOrganizationIds,
              },
            },
            status: {
              in: ACTIVE_CYCLE_STATUSES,
            },
          },
        }),
        prisma.reconciliationCycle.count({
          where: {
            storeLocation: {
              storeOrganizationId: {
                in: storeOrganizationIds,
              },
            },
            status: {
              in: ACTIVE_CYCLE_STATUSES,
            },
            importBatches: {
              none: {
                sourceType: "STORE",
                isCurrent: true,
              },
            },
          },
        }),
        prisma.mismatch.count({
          where: {
            cycle: {
              storeLocation: {
                storeOrganizationId: {
                  in: storeOrganizationIds,
                },
              },
            },
            status: "OPEN",
          },
        }),
        prisma.statement.count({
          where: {
            cycle: {
              storeLocation: {
                storeOrganizationId: {
                  in: storeOrganizationIds,
                },
              },
            },
            status: "FINAL",
          },
        }),
        prisma.reconciliationCycle.findMany({
          where: {
            storeLocation: {
              storeOrganizationId: {
                in: storeOrganizationIds,
              },
            },
          },
          orderBy: [{ periodMonth: "desc" }, { updatedAt: "desc" }],
          take: 6,
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
              },
            },
            mismatches: {
              select: {
                status: true,
              },
            },
            statements: {
              orderBy: [{ version: "desc" }],
              take: 1,
              select: {
                status: true,
              },
            },
          },
        }),
        prisma.importBatch.findMany({
          where: {
            sourceType: "STORE",
            cycle: {
              storeLocation: {
                storeOrganizationId: {
                  in: storeOrganizationIds,
                },
              },
            },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 6,
          select: {
            id: true,
            status: true,
            uploadedFile: {
              select: {
                originalFilename: true,
                uploadedAt: true,
              },
            },
            cycle: {
              select: {
                periodMonth: true,
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

    return {
      kind: "ready",
      userName,
      context: {
        primaryStoreOrganizationName,
        totalStoreOrganizations: scopedStoreOrganizations.length,
        totalLocations,
        isFallbackContext,
      },
      summary: [
        {
          label: "Active Cycles",
          value: String(activeCyclesCount),
          detail:
            "Open reconciliation cycles across your assigned store locations.",
          tone: "neutral",
        },
        {
          label: "Pending Store Uploads",
          value: String(pendingStoreUploadsCount),
          detail:
            "Cycles still waiting on a current store-side source file.",
          tone: "warning",
        },
        {
          label: "Open Mismatches",
          value: String(openMismatchesCount),
          detail:
            "Row-level mismatches still requiring review or resolution.",
          tone: "warning",
        },
        {
          label: "Ready Statements",
          value: String(readyStatementsCount),
          detail:
            "Finalized statements available for store-side finance review.",
          tone: "success",
        },
      ],
      recentCycles: recentCycles.map((cycle) => ({
        id: cycle.id,
        monthLabel: formatMonth(cycle.periodMonth),
        lpName: cycle.lp.name,
        storeLocation: cycle.storeLocation.name,
        cycleStatus: cycle.status,
        mismatchCount: cycle.mismatches.filter(
          (mismatch) => mismatch.status === "OPEN",
        ).length,
        statementStatus: mapStatementStatus(cycle.statements[0]?.status),
      })),
      recentUploads: recentUploads.map((batch) => ({
        id: batch.id,
        monthLabel: formatMonth(batch.cycle.periodMonth),
        storeLocation: batch.cycle.storeLocation.name,
        fileName: batch.uploadedFile.originalFilename,
        uploadedAt: batch.uploadedFile.uploadedAt,
        status: batch.status,
      })),
    };
  } catch (error) {
    console.error("Failed to load store dashboard", error);

    return {
      kind: "error",
      userName,
      message:
        "We could not load the store organization dashboard right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function ErrorState({
  userName,
  message,
}: {
  userName: string;
  message: string;
}) {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Dashboard unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Store organization dashboard could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-slate-200">Signed in as {userName}</div>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link href="/login">Re-authenticate</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  userName,
  isAdminPreview,
}: {
  userName: string;
  isAdminPreview: boolean;
}) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
          VendorStream
        </div>
        <CardTitle className="text-3xl text-white">
          No store organization memberships found
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {isAdminPreview
            ? "No direct store memberships are assigned. Once store routes are expanded, admin preview can fall back to the first active store organization."
            : "Your account does not yet have a store organization membership. Store uploads, cycle review, and statement workflows will appear here after assignment."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-slate-200">Signed in as {userName}</div>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link href="mailto:support@vendorstream.ca">Contact support</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function StoreDashboardPage() {
  const state = await getStoreDashboardState();

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        {state.kind === "error" ? (
          <ErrorState userName={state.userName} message={state.message} />
        ) : null}

        {state.kind === "empty" ? (
          <EmptyState
            userName={state.userName}
            isAdminPreview={state.isAdminPreview}
          />
        ) : null}

        {state.kind === "ready" ? (
          <>
            <header className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
                  Store Organization Workspace
                </div>
                {state.context.isFallbackContext ? (
                  <StatusBadge
                    label="Admin Preview"
                    className="border-amber-400/30 bg-amber-500/10 text-amber-100"
                  />
                ) : null}
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Welcome back, {state.userName}
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  Track monthly store uploads, reconciliation readiness, and
                  statement availability for {state.context.primaryStoreOrganizationName}
                  {state.context.totalStoreOrganizations > 1
                    ? ` and ${state.context.totalStoreOrganizations - 1} more store organizations`
                    : ""}.
                </p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                Monitoring {state.context.totalLocations} active store
                {state.context.totalLocations === 1 ? " location" : " locations"}{" "}
                across your current access scope.
                {state.context.isFallbackContext
                  ? " TODO: replace admin fallback selection with explicit store-org context switching once role-aware navigation is wired."
                  : ""}
              </div>
            </header>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {state.summary.map((item) => (
                <SummaryCard key={item.label} item={item} />
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Recent reconciliation cycles
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Latest store-side cycle activity across your assigned locations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {state.recentCycles.length > 0 ? (
                    state.recentCycles.map((cycle) => (
                      <div
                        key={cycle.id}
                        className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                      >
                        <div className="grid gap-4 xl:grid-cols-[0.9fr_1fr_1fr_0.9fr_0.7fr_0.8fr] xl:items-start">
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              Month
                            </div>
                            <div className="text-sm font-medium text-white">
                              {cycle.monthLabel}
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
                              Cycle status
                            </div>
                            <StatusBadge
                              label={formatCycleStatus(cycle.cycleStatus)}
                              className={getCycleTone(cycle.cycleStatus)}
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
                              Statement status
                            </div>
                            <StatusBadge
                              label={cycle.statementStatus}
                              className={getStatementTone(cycle.statementStatus)}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                      No reconciliation cycles are available yet for the current
                      store organization context.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <QuickActionCard
                  title="Upload Store Monthly File"
                  description="Submit the current store-side workbook for the next reconciliation cycle."
                  href="/store/uploads/new"
                />
                <QuickActionCard
                  title="View Store Uploads"
                  description="Review recent store import batches, validation states, and file history."
                  href="/store/uploads"
                />
                <QuickActionCard
                  title="Review Mismatches"
                  description="Open mismatch queues for cycles that still need store-side review."
                  href="/store/cycles?status=MISMATCHES_FOUND"
                />
                <QuickActionCard
                  title="View Statements"
                  description="Browse finalized store-related statements and payout-ready outputs."
                  href="/store/statements"
                />
              </div>
            </div>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Recent store uploads
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Latest store-side upload batches across your assigned locations.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.recentUploads.length > 0 ? (
                  state.recentUploads.map((upload) => (
                    <div
                      key={upload.id}
                      className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                    >
                      <div className="grid gap-4 xl:grid-cols-[0.8fr_1fr_1.2fr_0.9fr_0.8fr] xl:items-start">
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Month
                          </div>
                          <div className="text-sm font-medium text-white">
                            {upload.monthLabel}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Store location
                          </div>
                          <div className="text-sm text-slate-300">
                            {upload.storeLocation}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Filename
                          </div>
                          <div className="text-sm text-slate-300">
                            {upload.fileName}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Uploaded at
                          </div>
                          <div className="text-sm text-slate-300">
                            {formatDateTime(upload.uploadedAt)}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Status
                          </div>
                          <StatusBadge
                            label={formatUploadStatus(upload.status)}
                            className={getUploadTone(upload.status)}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                    No store upload batches have been recorded yet for this scope.
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  );
}
