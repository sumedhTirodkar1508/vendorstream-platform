import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma, type Prisma, type $Enums } from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { MismatchResolutionForm } from "@/components/mismatch-resolution-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatDateTime,
  formatEnumLabel,
  formatMonthLabel,
} from "@/lib/format";
import { getLpAccessContextForUser } from "@/lib/lp-access-context";
import { resolveMismatch } from "@/lib/mismatch-resolution-server";
import { getMismatchStatusBadgeClassName } from "@/lib/status-badges";

type MismatchStatus = $Enums.MismatchStatus;
type MismatchType = $Enums.MismatchType;
type ResolutionAction = $Enums.ResolutionAction;

type ReviewTab = "open" | "resolved" | "waived";

type MismatchRow = {
  id: string;
  type: MismatchType;
  status: MismatchStatus;
  fieldName: string | null;
  message: string;
  barcode: string | null;
  productName: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  details: Prisma.JsonValue | null;
  latestResolution: {
    id: string;
    action: ResolutionAction;
    comment: string | null;
    createdAt: Date;
    createdBy: string;
  } | null;
  resolutions: Array<{
    id: string;
    action: ResolutionAction;
    comment: string | null;
    payload: Prisma.JsonValue | null;
    createdAt: Date;
    createdBy: string;
  }>;
};

type LpCycleMismatchState =
  | {
      kind: "ready";
      cycle: {
        id: string;
        lpName: string;
        storeOrganizationName: string;
        storeLocationName: string;
        month: Date;
        status: string;
      };
      activeTab: ReviewTab;
      counts: Record<ReviewTab, number>;
      rows: MismatchRow[];
      selectedMismatch: MismatchRow | null;
      canManageResolutions: boolean;
    }
  | {
      kind: "empty";
      cycle: {
        id: string;
        lpName: string;
        storeOrganizationName: string;
        storeLocationName: string;
        month: Date;
        status: string;
      };
      activeTab: ReviewTab;
      counts: Record<ReviewTab, number>;
      canManageResolutions: boolean;
    }
  | {
      kind: "missing";
      cycleId: string;
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "error";
      message: string;
    };

function normalizeTab(value: string | undefined): ReviewTab {
  if (value === "resolved" || value === "waived") {
    return value;
  }

  return "open";
}

function buildTabHref(cycleId: string, tab: ReviewTab, mismatchId?: string | null) {
  const params = new URLSearchParams();
  params.set("view", tab);

  if (mismatchId) {
    params.set("mismatchId", mismatchId);
  }

  return `/lp/cycles/${cycleId}/mismatches?${params.toString()}`;
}

function getMutationBanner(mutation: string | undefined) {
  if (mutation === "resolved_accept_lp") {
    return {
      tone: "success" as const,
      message: "Mismatch resolved with Accept LP.",
    };
  }

  if (mutation === "resolved_accept_store") {
    return {
      tone: "success" as const,
      message: "Mismatch resolved with Accept store.",
    };
  }

  if (mutation === "resolved_manual_override") {
    return {
      tone: "success" as const,
      message: "Manual override recorded and mismatch marked resolved.",
    };
  }

  if (mutation === "waived") {
    return {
      tone: "success" as const,
      message: "Mismatch waived successfully.",
    };
  }

  if (mutation === "commented") {
    return {
      tone: "success" as const,
      message: "Comment recorded successfully.",
    };
  }

  if (mutation === "invalid") {
    return {
      tone: "warning" as const,
      message:
        "The submitted mismatch resolution was invalid. Check the action, comment, and payload fields.",
    };
  }

  if (mutation === "invalid_payload") {
    return {
      tone: "warning" as const,
      message: "Manual override payload must be valid JSON.",
    };
  }

  if (mutation === "forbidden") {
    return {
      tone: "warning" as const,
      message: "You are not authorized to resolve mismatches in this LP workspace.",
    };
  }

  if (mutation === "not_found") {
    return {
      tone: "warning" as const,
      message: "The selected mismatch could not be found.",
    };
  }

  if (mutation === "already_closed") {
    return {
      tone: "warning" as const,
      message:
        "This mismatch is already closed. Only comment-only entries can be added now.",
    };
  }

  if (mutation === "error") {
    return {
      tone: "warning" as const,
      message: "Mismatch resolution could not be completed. Try again shortly.",
    };
  }

  return null;
}

async function submitLpMismatchResolution(formData: FormData) {
  "use server";

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const cycleId = String(formData.get("cycleId") || "").trim();
  const currentView = normalizeTab(String(formData.get("currentView") || "").trim());
  const mismatchId = String(formData.get("mismatchId") || "").trim();
  const resolutionAction = String(formData.get("resolutionAction") || "").trim();
  const comment = String(formData.get("comment") || "");
  const payloadJson = String(formData.get("payloadJson") || "");

  const fallbackHref = buildTabHref(cycleId, currentView, mismatchId || undefined);

  if (!session.user.id || !cycleId || !mismatchId) {
    redirect(`${fallbackHref}&mutation=invalid`);
  }

  const result = await resolveMismatch({
    mismatchId,
    action: resolutionAction as $Enums.ResolutionAction,
    actor: {
      userId: session.user.id,
      systemRole: session.user.systemRole,
    },
    workspace: "LP",
    comment,
    payloadJson,
  });

  if (result.status !== "success") {
    const href = buildTabHref(
      result.cycleId ?? cycleId,
      currentView,
      result.mismatchId ?? mismatchId,
    );

    redirect(`${href}&mutation=${result.status}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/lp/cycles");
  revalidatePath(`/lp/cycles/${result.cycleId}`);
  revalidatePath(`/lp/cycles/${result.cycleId}/mismatches`);

  redirect(
    `${buildTabHref(result.cycleId, result.nextTab, result.mismatchId)}&mutation=${
      result.action === "WAIVE"
        ? "waived"
        : result.action === "COMMENT_ONLY"
          ? "commented"
          : result.action === "MANUAL_OVERRIDE"
            ? "resolved_manual_override"
            : result.action === "ACCEPT_LP"
              ? "resolved_accept_lp"
              : "resolved_accept_store"
    }`,
  );
}

function getTypeTone(type: MismatchType) {
  if (
    type === "FIELD_DIFFERENCE" ||
    type === "PRICE_FORMULA_FALLBACK" ||
    type === "BUSINESS_RULE_VIOLATION"
  ) {
    return "border-cyan-400/20 bg-cyan-400/10 text-cyan-100";
  }

  if (
    type === "MISSING_COUNTERPART" ||
    type === "DUPLICATE_ROW" ||
    type === "MANUAL_REVIEW_REQUIRED"
  ) {
    return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
}

function getBarcodeAndProduct(mismatch: {
  details: Prisma.JsonValue | null;
  reconciliationResult: {
    barcode: string | null;
    productName: string | null;
  } | null;
}) {
  const details =
    mismatch.details &&
    typeof mismatch.details === "object" &&
    !Array.isArray(mismatch.details)
      ? mismatch.details
      : null;

  const barcodeFromDetails =
    details && typeof details.barcode === "string" ? details.barcode : null;
  const productFromDetails =
    details && typeof details.productName === "string"
      ? details.productName
      : null;

  return {
    barcode: mismatch.reconciliationResult?.barcode ?? barcodeFromDetails,
    productName:
      mismatch.reconciliationResult?.productName ?? productFromDetails,
  };
}

async function getLpCycleMismatchState(
  cycleId: string,
  searchParams?: {
    view?: string;
    mismatchId?: string;
    mutation?: string;
  },
): Promise<LpCycleMismatchState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    redirect("/login");
  }

  const activeTab = normalizeTab(searchParams?.view);

  try {
    const cycle = await prisma.reconciliationCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        lpId: true,
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
            storeOrganization: {
              select: {
                name: true,
              },
            },
          },
        },
        mismatches: {
          where: {
            ...(activeTab === "open"
              ? { status: "OPEN" }
              : activeTab === "resolved"
                ? { status: "RESOLVED" }
                : { status: "WAIVED" }),
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            type: true,
            status: true,
            fieldName: true,
            message: true,
            details: true,
            resolvedAt: true,
            resolvedBy: {
              select: {
                name: true,
                email: true,
              },
            },
            reconciliationResult: {
              select: {
                barcode: true,
                productName: true,
              },
            },
            resolutions: {
              orderBy: [{ createdAt: "desc" }],
              select: {
                id: true,
                action: true,
                comment: true,
                payload: true,
                createdAt: true,
                createdBy: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cycle) {
      return {
        kind: "missing",
        cycleId,
      };
    }

    const context = await getLpAccessContextForUser({
      userId: session.user.id,
      systemRole: session.user.systemRole,
    });

    const isAdmin = session.user.systemRole === "ADMIN";
    const membership = await prisma.lpMembership.findFirst({
      where: {
        userId: session.user.id,
        lpId: cycle.lpId,
      },
      select: {
        role: true,
      },
    });
    const canManageResolutions =
      isAdmin ||
      membership?.role === "LP_ADMIN" ||
      membership?.role === "LP_MANAGER";

    if (!isAdmin && !context.lpIds.includes(cycle.lpId)) {
      return { kind: "forbidden" };
    }

    const countsQuery = await prisma.mismatch.groupBy({
      by: ["status"],
      where: {
        cycleId,
      },
      _count: {
        _all: true,
      },
    });

    const counts: Record<ReviewTab, number> = {
      open:
        countsQuery.find((entry) => entry.status === "OPEN")?._count._all ?? 0,
      resolved:
        countsQuery.find((entry) => entry.status === "RESOLVED")?._count._all ??
        0,
      waived:
        countsQuery.find((entry) => entry.status === "WAIVED")?._count._all ?? 0,
    };

    const rows: MismatchRow[] = cycle.mismatches.map((mismatch) => {
      const latestResolution = mismatch.resolutions[0] ?? null;
      const identity = getBarcodeAndProduct(mismatch);

      return {
        id: mismatch.id,
        type: mismatch.type,
        status: mismatch.status,
        fieldName: mismatch.fieldName,
        message: mismatch.message,
        barcode: identity.barcode,
        productName: identity.productName,
        resolvedBy:
          mismatch.resolvedBy?.name || mismatch.resolvedBy?.email || null,
        resolvedAt: mismatch.resolvedAt,
        details: mismatch.details,
        latestResolution: latestResolution
          ? {
              id: latestResolution.id,
              action: latestResolution.action,
              comment: latestResolution.comment,
              createdAt: latestResolution.createdAt,
              createdBy:
                latestResolution.createdBy.name ||
                latestResolution.createdBy.email ||
                "Unknown user",
            }
          : null,
        resolutions: mismatch.resolutions.map((resolution) => ({
          id: resolution.id,
          action: resolution.action,
          comment: resolution.comment,
          payload: resolution.payload,
          createdAt: resolution.createdAt,
          createdBy:
            resolution.createdBy.name ||
            resolution.createdBy.email ||
            "Unknown user",
        })),
      };
    });

    if (rows.length === 0) {
      return {
        kind: "empty",
        cycle: {
          id: cycle.id,
          lpName: cycle.lp.name,
          storeOrganizationName: cycle.storeLocation.storeOrganization.name,
          storeLocationName: cycle.storeLocation.name,
          month: cycle.periodMonth,
          status: cycle.status,
        },
        activeTab,
        counts,
        canManageResolutions,
      };
    }

    const selectedMismatch =
      rows.find((row) => row.id === searchParams?.mismatchId?.trim()) ??
      rows[0] ??
      null;

    return {
      kind: "ready",
      cycle: {
        id: cycle.id,
        lpName: cycle.lp.name,
        storeOrganizationName: cycle.storeLocation.storeOrganization.name,
        storeLocationName: cycle.storeLocation.name,
        month: cycle.periodMonth,
        status: cycle.status,
      },
      activeTab,
      counts,
      rows,
      selectedMismatch,
      canManageResolutions,
    };
  } catch (error) {
    console.error("Failed to load LP cycle mismatches", error);

    return {
      kind: "error",
      message:
        "We could not load mismatch review data right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
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

function MissingState({ cycleId }: { cycleId: string }) {
  return (
    <Card className="border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-100">
          Cycle not found
        </div>
        <CardTitle className="text-2xl text-white">
          No mismatch review data is available for this cycle
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-amber-100/90">
          The cycle ID <span className="font-medium text-white">{cycleId}</span>{" "}
          does not match a cycle in the current LP context.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/cycles">Back to cycles</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ForbiddenState() {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Access restricted
        </div>
        <CardTitle className="text-2xl text-white">
          You do not have access to this mismatch workspace
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          This cycle does not belong to an LP workspace in your current access
          scope.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/cycles">Back to cycles</Link>
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
          Mismatch review unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Cycle mismatches could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/lp/cycles">Back to cycles</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  cycle,
  activeTab,
  counts,
}: Extract<LpCycleMismatchState, { kind: "empty" }>) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["open", "resolved", "waived"] as const).map((tab) => (
          <Link
            key={tab}
            href={buildTabHref(cycle.id, tab)}
            className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
              activeTab === tab
                ? "border-cyan-400/30 bg-cyan-400/10"
                : "border-white/10 bg-white/6 hover:bg-white/8"
            }`}
          >
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
              {tab}
            </div>
            <div className="mt-2 text-3xl font-semibold text-white">
              {counts[tab]}
            </div>
          </Link>
        ))}
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            {cycle.lpName} · {cycle.storeLocationName}
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            {cycle.storeOrganizationName} · {formatMonthLabel(cycle.month)} ·{" "}
            {formatEnumLabel(cycle.status)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href={`/lp/cycles/${cycle.id}`}>Back to cycle details</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No mismatches in this view
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            There are no {activeTab} mismatches for this reconciliation cycle.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export default async function LpCycleMismatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ cycleId: string }>;
  searchParams?: Promise<{
    view?: string;
    mismatchId?: string;
    mutation?: string;
  }>;
}) {
  const { cycleId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const state = await getLpCycleMismatchState(cycleId, resolvedSearchParams);
  const mutationBanner = getMutationBanner(resolvedSearchParams?.mutation);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06111f] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(27,55,95,0.55),transparent_42%)]" />
        <div className="absolute left-[-10%] top-[18%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute right-[-8%] top-[12%] h-[28rem] w-[28rem] rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,17,31,0.72)_0%,rgba(6,17,31,0.96)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            LP Mismatch Review
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Cycle mismatches
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review cycle-level mismatches from the LP side, inspect resolution
              history, and prepare future resolution actions.
            </p>
          </div>
        </header>

        {mutationBanner ? (
          <div
            className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${
              mutationBanner.tone === "success"
                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                : "border-amber-400/20 bg-amber-500/10 text-amber-100"
            }`}
          >
            {mutationBanner.message}
          </div>
        ) : null}

        {state.kind === "missing" ? <MissingState cycleId={state.cycleId} /> : null}
        {state.kind === "forbidden" ? <ForbiddenState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? (
          <EmptyState
            kind="empty"
            cycle={state.cycle}
            activeTab={state.activeTab}
            counts={state.counts}
            canManageResolutions={state.canManageResolutions}
          />
        ) : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
                      {formatMonthLabel(state.cycle.month)}
                    </div>
                    <StatusBadge
                      label={formatEnumLabel(state.cycle.status)}
                      className="border-white/10 bg-white/5 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-3xl text-white">
                      {state.cycle.lpName}
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      {state.cycle.storeOrganizationName} ·{" "}
                      {state.cycle.storeLocationName}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  <DetailRow label="Cycle ID" value={state.cycle.id} />
                  <DetailRow
                    label="Month"
                    value={formatMonthLabel(state.cycle.month)}
                  />
                  <DetailRow label="LP" value={state.cycle.lpName} />
                  <DetailRow
                    label="Store organization"
                    value={state.cycle.storeOrganizationName}
                  />
                  <DetailRow
                    label="Store location"
                    value={state.cycle.storeLocationName}
                  />
                  <DetailRow
                    label="Cycle status"
                    value={formatEnumLabel(state.cycle.status)}
                  />
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">Mismatch counts</CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Current cycle-level mismatch totals by review state.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  {(["open", "resolved", "waived"] as const).map((tab) => (
                    <Link
                      key={tab}
                      href={buildTabHref(state.cycle.id, tab)}
                      className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                        state.activeTab === tab
                          ? "border-cyan-400/30 bg-cyan-400/10"
                          : "border-white/10 bg-white/6 hover:bg-white/8"
                      }`}
                    >
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        {tab}
                      </div>
                      <div className="mt-2 text-3xl font-semibold text-white">
                        {state.counts[tab]}
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">Mismatch records</CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Real mismatch rows for the current cycle and selected review
                    tab.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {state.rows.map((row) => (
                    <div
                      key={row.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        row.id === state.selectedMismatch?.id
                          ? "border-cyan-400/30 bg-cyan-400/10"
                          : "border-white/8 bg-slate-950/35"
                      }`}
                    >
                      <div className="grid gap-4 xl:grid-cols-[0.9fr_0.7fr_0.8fr_1.2fr_1fr_0.8fr_0.8fr_auto] xl:items-start">
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Type
                          </div>
                          <StatusBadge
                            label={formatEnumLabel(row.type)}
                            className={getTypeTone(row.type)}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Status
                          </div>
                          <StatusBadge
                            label={formatEnumLabel(row.status)}
                            className={getMismatchStatusBadgeClassName(row.status)}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Field name
                          </div>
                          <div className="text-sm text-slate-300">
                            {row.fieldName ?? "Not available"}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Message
                          </div>
                          <div className="text-sm text-slate-300">
                            {row.message}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Barcode / product
                          </div>
                          <div className="text-sm text-slate-300">
                            {row.barcode ?? "No barcode"}
                            <div className="text-xs text-slate-500">
                              {row.productName ?? "No product name"}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Resolved by
                          </div>
                          <div className="text-sm text-slate-300">
                            {row.resolvedBy ?? "Not resolved"}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Resolved at
                          </div>
                          <div className="text-sm text-slate-300">
                            {formatDateTime(row.resolvedAt)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                          >
                            <Link
                              href={buildTabHref(
                                state.cycle.id,
                                state.activeTab,
                                row.id,
                              )}
                            >
                              View details
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Selected mismatch
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Focused detail view for the currently selected mismatch
                      row.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {state.selectedMismatch ? (
                      <>
                        <DetailRow label="Mismatch ID" value={state.selectedMismatch.id} />
                        <DetailRow
                          label="Type"
                          value={
                            <StatusBadge
                              label={formatEnumLabel(state.selectedMismatch.type)}
                              className={getTypeTone(state.selectedMismatch.type)}
                            />
                          }
                        />
                        <DetailRow
                          label="Status"
                          value={
                            <StatusBadge
                              label={formatEnumLabel(state.selectedMismatch.status)}
                              className={getMismatchStatusBadgeClassName(
                                state.selectedMismatch.status,
                              )}
                            />
                          }
                        />
                        <DetailRow
                          label="Field name"
                          value={
                            state.selectedMismatch.fieldName ?? "Not available"
                          }
                        />
                        <DetailRow
                          label="Barcode"
                          value={state.selectedMismatch.barcode ?? "Not available"}
                        />
                        <DetailRow
                          label="Product"
                          value={
                            state.selectedMismatch.productName ?? "Not available"
                          }
                        />
                        <DetailRow
                          label="Resolved by"
                          value={
                            state.selectedMismatch.resolvedBy ?? "Not resolved"
                          }
                        />
                        <DetailRow
                          label="Resolved at"
                          value={formatDateTime(state.selectedMismatch.resolvedAt)}
                        />
                        <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Message
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-300">
                            {state.selectedMismatch.message}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Details
                          </div>
                          <pre className="mt-2 overflow-x-auto text-xs leading-6 text-slate-300">
                            {JSON.stringify(state.selectedMismatch.details, null, 2) ||
                              "No structured details available."}
                          </pre>
                        </div>
                        <MismatchResolutionForm
                          mismatchId={state.selectedMismatch.id}
                          mismatchStatus={state.selectedMismatch.status}
                          canManage={state.canManageResolutions}
                          action={submitLpMismatchResolution}
                          hiddenFields={{
                            cycleId: state.cycle.id,
                            currentView: state.activeTab,
                          }}
                        />
                      </>
                    ) : null}
                  </CardContent>
                </Card>

                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Resolution history
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Latest recorded resolution events for the selected
                      mismatch.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {state.selectedMismatch?.resolutions.length ? (
                      state.selectedMismatch.resolutions.map((resolution) => (
                        <div
                          key={resolution.id}
                          className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <StatusBadge
                              label={formatEnumLabel(resolution.action)}
                              className="border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                            />
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              {formatDateTime(resolution.createdAt)}
                            </div>
                          </div>
                          <div className="mt-3 text-sm text-slate-300">
                            Created by {resolution.createdBy}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-300">
                            {resolution.comment ?? "No comment recorded."}
                          </div>
                          {resolution.payload !== null ? (
                            <pre className="mt-3 overflow-x-auto rounded-xl border border-white/8 bg-slate-950/50 p-3 text-xs leading-6 text-slate-300">
                              {JSON.stringify(resolution.payload, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                        No resolution history has been recorded yet for this
                        mismatch.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-3">
                  <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
                    <Link href={`/lp/cycles/${state.cycle.id}`}>
                      Back to cycle details
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
