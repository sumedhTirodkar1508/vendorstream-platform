import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type Prisma, type $Enums } from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getStoreUploadContextForUser } from "@/lib/store-upload-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

type StoreCycleMismatchState =
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
      activeType: string;
      typeOptions: MismatchType[];
      counts: Record<ReviewTab, number>;
      rows: MismatchRow[];
      selectedMismatch: MismatchRow | null;
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
      activeType: string;
      typeOptions: MismatchType[];
      counts: Record<ReviewTab, number>;
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

const TYPE_OPTIONS: MismatchType[] = [
  "MISSING_COUNTERPART",
  "FIELD_DIFFERENCE",
  "PRICE_FORMULA_FALLBACK",
  "DUPLICATE_ROW",
  "BUSINESS_RULE_VIOLATION",
  "BARCODE_NORMALIZATION_REQUIRED",
  "MANUAL_REVIEW_REQUIRED",
];

function normalizeTab(value: string | undefined): ReviewTab {
  if (value === "resolved" || value === "waived") {
    return value;
  }

  return "open";
}

function isMismatchType(value: string | undefined): value is MismatchType {
  if (!value) {
    return false;
  }

  return TYPE_OPTIONS.includes(value as MismatchType);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
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

function formatMismatchType(value: MismatchType) {
  return value.replaceAll("_", " ");
}

function formatMismatchStatus(value: MismatchStatus) {
  return value.replaceAll("_", " ");
}

function formatResolutionAction(value: ResolutionAction) {
  return value.replaceAll("_", " ");
}

function formatCycleStatus(value: string) {
  return value.replaceAll("_", " ");
}

function buildMismatchHref(
  cycleId: string,
  tab: ReviewTab,
  mismatchType?: string,
  mismatchId?: string | null,
) {
  const params = new URLSearchParams();
  params.set("view", tab);

  if (mismatchType) {
    params.set("type", mismatchType);
  }

  if (mismatchId) {
    params.set("mismatchId", mismatchId);
  }

  return `/store/cycles/${cycleId}/mismatches?${params.toString()}`;
}

function getStatusTone(status: MismatchStatus) {
  if (status === "RESOLVED") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  if (status === "WAIVED") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
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

function Badge({ label, className }: { label: string; className: string }) {
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

async function getStoreCycleMismatchState(
  cycleId: string,
  searchParams?: {
    view?: string;
    type?: string;
    mismatchId?: string;
  },
): Promise<StoreCycleMismatchState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    redirect("/login");
  }

  const activeTab = normalizeTab(searchParams?.view);
  const activeType: string = isMismatchType(searchParams?.type)
    ? (searchParams?.type as string)
    : "";

  try {
    const context = await getStoreUploadContextForUser({
      userId: session.user.id,
      systemRole: session.user.systemRole,
    });

    const allowedPairs = new Set(
      context.options.map(
        (option) => `${option.lpId}:${option.storeLocationId}`,
      ),
    );

    const cycle: any = await prisma.reconciliationCycle.findUnique({
      where: { id: cycleId },
      select: {
        id: true,
        lpId: true,
        storeLocationId: true,
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
            ...(activeType ? { type: activeType as MismatchType } : {}),
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
        _count: {
          select: {
            mismatches: true,
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

    const isAdmin = session.user.systemRole === "ADMIN";
    const pairKey = `${cycle.lpId}:${cycle.storeLocationId}`;

    if (!isAdmin && !allowedPairs.has(pairKey)) {
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
        countsQuery.find((entry: any) => entry.status === "OPEN")?._count
          ._all ?? 0,
      resolved:
        countsQuery.find((entry: any) => entry.status === "RESOLVED")?._count
          ._all ?? 0,
      waived:
        countsQuery.find((entry: any) => entry.status === "WAIVED")?._count
          ._all ?? 0,
    };

    const rows: MismatchRow[] = cycle.mismatches.map((mismatch: any) => {
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
        resolutions: mismatch.resolutions.map((resolution: any) => ({
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

    const selectedMismatch =
      rows.find((row) => row.id === searchParams?.mismatchId?.trim()) ??
      rows[0] ??
      null;

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
        activeType,
        typeOptions: TYPE_OPTIONS,
        counts,
      };
    }

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
      activeType,
      typeOptions: TYPE_OPTIONS,
      counts,
      rows,
      selectedMismatch,
    };
  } catch (error) {
    console.error("Failed to load store cycle mismatches", error);

    return {
      kind: "error",
      message:
        "We could not load mismatch review data right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function MissingState({ cycleId }: { cycleId: string }) {
  return (
    <Card className="border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-100">
          Cycle not found
        </div>
        <CardTitle className="text-2xl text-white">
          No mismatch review workspace matched this cycle
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-amber-100/90">
          The cycle ID <span className="font-medium text-white">{cycleId}</span>{" "}
          is not available in the current store workspace.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/store/cycles">Back to store cycles</Link>
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
          This cycle does not belong to a store location in your current access
          scope.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/store/cycles">Back to store cycles</Link>
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
          Mismatch workspace unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Store cycle mismatches could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/store/cycles">Back to store cycles</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  cycle,
  activeTab,
  activeType,
  typeOptions,
  counts,
}: Extract<StoreCycleMismatchState, { kind: "empty" }>) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["open", "resolved", "waived"] as const).map((tab) => (
          <Link
            key={tab}
            href={buildMismatchHref(cycle.id, tab, activeType || undefined)}
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
          <CardTitle className="text-lg text-white">Filters</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Narrow mismatch review by status tab or mismatch type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <label
                htmlFor="type"
                className="text-sm font-medium text-slate-200"
              >
                Mismatch type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={activeType}
                className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
              >
                <option value="" className="bg-slate-950 text-white">
                  All mismatch types
                </option>
                {typeOptions.map((type) => (
                  <option
                    key={type}
                    value={type}
                    className="bg-slate-950 text-white"
                  >
                    {formatMismatchType(type)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-3">
              <input type="hidden" name="view" value={activeTab} />
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
                <Link href={buildMismatchHref(cycle.id, activeTab)}>Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No mismatches in this view
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            The current status and type filters do not match any mismatch
            records for this cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            asChild
            className="bg-white text-slate-950 hover:bg-slate-100"
          >
            <Link href={`/store/cycles/${cycle.id}`}>
              Back to cycle details
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function StoreCycleMismatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ cycleId: string }>;
  searchParams?: Promise<{
    view?: string;
    type?: string;
    mismatchId?: string;
  }>;
}) {
  const { cycleId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const state = await getStoreCycleMismatchState(cycleId, resolvedSearchParams);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            Store Mismatch Review
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Cycle mismatches
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review cycle-level mismatches from the store side, inspect
              resolution history, and stage future resolution actions.
            </p>
          </div>
        </header>

        {state.kind === "missing" ? (
          <MissingState cycleId={state.cycleId} />
        ) : null}
        {state.kind === "forbidden" ? <ForbiddenState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}

        {state.kind === "empty" ? (
          <EmptyState
            kind="empty"
            cycle={state.cycle}
            activeTab={state.activeTab}
            activeType={state.activeType}
            typeOptions={state.typeOptions}
            counts={state.counts}
          />
        ) : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
                      {formatMonth(state.cycle.month)}
                    </div>
                    <Badge
                      label={formatCycleStatus(state.cycle.status)}
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
                    value={formatMonth(state.cycle.month)}
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
                    value={formatCycleStatus(state.cycle.status)}
                  />
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Mismatch counts
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Current cycle-level mismatch totals by review state.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  {(["open", "resolved", "waived"] as const).map((tab) => (
                    <Link
                      key={tab}
                      href={buildMismatchHref(
                        state.cycle.id,
                        tab,
                        state.activeType || undefined,
                      )}
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

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg text-white">Filters</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Narrow mismatch review by status tab or mismatch type.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <label
                      htmlFor="type"
                      className="text-sm font-medium text-slate-200"
                    >
                      Mismatch type
                    </label>
                    <select
                      id="type"
                      name="type"
                      defaultValue={state.activeType}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All mismatch types
                      </option>
                      {state.typeOptions.map((type) => (
                        <option
                          key={type}
                          value={type}
                          className="bg-slate-950 text-white"
                        >
                          {formatMismatchType(type)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-3">
                    <input type="hidden" name="view" value={state.activeTab} />
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
                        href={buildMismatchHref(
                          state.cycle.id,
                          state.activeTab,
                        )}
                      >
                        Reset
                      </Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Mismatch records
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Real mismatch rows for the current cycle and filter set.
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
                          <Badge
                            label={formatMismatchType(row.type)}
                            className={getTypeTone(row.type)}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Status
                          </div>
                          <Badge
                            label={formatMismatchStatus(row.status)}
                            className={getStatusTone(row.status)}
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
                              href={buildMismatchHref(
                                state.cycle.id,
                                state.activeTab,
                                state.activeType || undefined,
                                row.id,
                              )}
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
                            Accept LP
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled
                            className="text-slate-300 disabled:text-slate-500"
                          >
                            Accept store
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
                        <DetailRow
                          label="Mismatch ID"
                          value={state.selectedMismatch.id}
                        />
                        <DetailRow
                          label="Type"
                          value={
                            <Badge
                              label={formatMismatchType(
                                state.selectedMismatch.type,
                              )}
                              className={getTypeTone(
                                state.selectedMismatch.type,
                              )}
                            />
                          }
                        />
                        <DetailRow
                          label="Status"
                          value={
                            <Badge
                              label={formatMismatchStatus(
                                state.selectedMismatch.status,
                              )}
                              className={getStatusTone(
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
                          value={
                            state.selectedMismatch.barcode ?? "Not available"
                          }
                        />
                        <DetailRow
                          label="Product"
                          value={
                            state.selectedMismatch.productName ??
                            "Not available"
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
                          value={formatDateTime(
                            state.selectedMismatch.resolvedAt,
                          )}
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
                            {JSON.stringify(
                              state.selectedMismatch.details,
                              null,
                              2,
                            ) || "No structured details available."}
                          </pre>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Button
                            type="button"
                            disabled
                            className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                          >
                            Accept LP
                          </Button>
                          <Button
                            type="button"
                            disabled
                            className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                          >
                            Accept store
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled
                            className="border-white/15 bg-white/5 text-white disabled:text-slate-500"
                          >
                            Manual override
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled
                            className="border-white/15 bg-white/5 text-white disabled:text-slate-500"
                          >
                            Waive
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled
                            className="text-slate-300 disabled:text-slate-500"
                          >
                            Comment
                          </Button>
                        </div>
                        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                          TODO: resolution actions will post real
                          `MismatchResolution` records and update cycle state
                          once the mutation layer is wired.
                        </div>
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
                            <Badge
                              label={formatResolutionAction(resolution.action)}
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
                  <Button
                    asChild
                    className="bg-white text-slate-950 hover:bg-slate-100"
                  >
                    <Link href={`/store/cycles/${state.cycle.id}`}>
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
