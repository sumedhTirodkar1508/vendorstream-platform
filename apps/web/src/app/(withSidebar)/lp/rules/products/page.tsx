import Link from "next/link";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  prisma,
  type LpMembershipRole,
  type Prisma,
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

type ActiveStatusFilter = "ACTIVE" | "INACTIVE";
type CategoryFilter = string;

type ProductRuleFilters = {
  lpId: string;
  category: string;
  activeStatus: string;
  ruleId: string;
  mutation: string;
};

type LpContextOption = {
  membershipId: string;
  lpId: string;
  lpName: string;
  lpCode: string | null;
  membershipRole: LpMembershipRole;
};

type CategoryOption = {
  id: string;
  label: string;
};

type ProductRuleRow = {
  id: string;
  barcode: string;
  productNameSnapshot: string | null;
  categoryRuleId: string | null;
  categoryKey: string | null;
  categoryDisplayName: string | null;
  productScale: string;
  isActive: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type LpProductRulesState =
  | {
      kind: "ready";
      filters: ProductRuleFilters;
      canManageRules: boolean;
      currentContext: {
        lpId: string;
        lpName: string;
        lpCode: string | null;
        membershipRole: LpMembershipRole;
        productRuleCount: number;
        activeProductRuleCount: number;
        linkedCategoryRuleCount: number;
        storeCoverageCount: number;
      };
      availableContexts: LpContextOption[];
      categoryOptions: CategoryOption[];
      rows: ProductRuleRow[];
      selectedRule: ProductRuleRow | null;
    }
  | {
      kind: "empty";
      filters: ProductRuleFilters;
      canManageRules: boolean;
      currentContext: {
        lpId: string;
        lpName: string;
        lpCode: string | null;
        membershipRole: LpMembershipRole;
        productRuleCount: number;
        activeProductRuleCount: number;
        linkedCategoryRuleCount: number;
        storeCoverageCount: number;
      };
      availableContexts: LpContextOption[];
      categoryOptions: CategoryOption[];
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "error";
      message: string;
    };

const MANAGEABLE_LP_ROLES: LpMembershipRole[] = ["LP_ADMIN", "LP_MANAGER"];
const ACTIVE_STATUS_OPTIONS: ActiveStatusFilter[] = ["ACTIVE", "INACTIVE"];
const UNLINKED_CATEGORY_FILTER = "UNLINKED";

function formatDate(value: Date | null) {
  if (!value) {
    return "Open-ended";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatEnumLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatDecimal(value: Prisma.Decimal, suffix?: string) {
  const formatted = value.toFixed(4);
  return suffix ? `${formatted}${suffix}` : formatted;
}

function buildProductRulesHref(
  filters: Omit<ProductRuleFilters, "mutation"> & { mutation?: string },
) {
  const params = new URLSearchParams();

  if (filters.lpId) {
    params.set("lpId", filters.lpId);
  }

  if (filters.category) {
    params.set("category", filters.category);
  }

  if (filters.activeStatus) {
    params.set("activeStatus", filters.activeStatus);
  }

  if (filters.ruleId) {
    params.set("ruleId", filters.ruleId);
  }

  if (filters.mutation) {
    params.set("mutation", filters.mutation);
  }

  const query = params.toString();
  return query ? `/lp/rules/products?${query}` : "/lp/rules/products";
}

function getActiveTone(isActive: boolean) {
  if (isActive) {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }

  return "border-red-400/30 bg-red-500/10 text-red-100";
}

function getRoleTone(role: LpMembershipRole) {
  if (role === "LP_ADMIN") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100";
  }

  if (role === "LP_MANAGER") {
    return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  }

  return "border-white/10 bg-white/5 text-slate-200";
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
  if (mutation === "activated") {
    return {
      tone: "success" as const,
      message: "Product scale rule activated successfully.",
    };
  }

  if (mutation === "deactivated") {
    return {
      tone: "success" as const,
      message: "Product scale rule deactivated successfully.",
    };
  }

  if (mutation === "invalid") {
    return {
      tone: "warning" as const,
      message: "The submitted product scale rule action was invalid.",
    };
  }

  if (mutation === "not_found") {
    return {
      tone: "warning" as const,
      message: "The selected product scale rule could not be found.",
    };
  }

  if (mutation === "forbidden") {
    return {
      tone: "warning" as const,
      message:
        "You are not authorized to manage product scale rules in this LP context.",
    };
  }

  if (mutation === "error") {
    return {
      tone: "warning" as const,
      message:
        "The product scale rule action could not be completed. Try again shortly.",
    };
  }

  return null;
}

async function toggleProductRuleStatus(formData: FormData) {
  "use server";

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const lpId = String(formData.get("lpId") || "").trim();
  const ruleId = String(formData.get("ruleId") || "").trim();
  const nextStatus = String(formData.get("nextStatus") || "").trim();
  const category = String(formData.get("categoryFilter") || "").trim();
  const activeStatus = String(formData.get("activeStatusFilter") || "").trim();

  const filters = {
    lpId,
    category,
    activeStatus,
    ruleId,
  };

  if (!lpId || !ruleId || !["ACTIVE", "INACTIVE"].includes(nextStatus)) {
    redirect(
      buildProductRulesHref({
        ...filters,
        mutation: "invalid",
      }),
    );
  }

  if (!session.user.id) {
    redirect(
      buildProductRulesHref({
        ...filters,
        mutation: "forbidden",
      }),
    );
  }

  const membership = await prisma.lpMembership.findFirst({
    where: {
      userId: session.user.id,
      lpId,
    },
    select: {
      role: true,
    },
  });

  const canManageRules =
    session.user.systemRole === "ADMIN" ||
    (membership ? MANAGEABLE_LP_ROLES.includes(membership.role) : false);

  if (!canManageRules) {
    redirect(
      buildProductRulesHref({
        ...filters,
        mutation: "forbidden",
      }),
    );
  }

  try {
    const rule = await prisma.productScaleRule.findFirst({
      where: {
        id: ruleId,
        lpId,
      },
      select: {
        id: true,
      },
    });

    if (!rule) {
      redirect(
        buildProductRulesHref({
          ...filters,
          mutation: "not_found",
        }),
      );
    }

    await prisma.productScaleRule.update({
      where: { id: ruleId },
      data: {
        isActive: nextStatus === "ACTIVE",
      },
    });

    revalidatePath("/lp/rules/products");

    redirect(
      buildProductRulesHref({
        ...filters,
        mutation: nextStatus === "ACTIVE" ? "activated" : "deactivated",
      }),
    );
  } catch (error) {
    console.error("Failed to update product scale rule status", error);

    redirect(
      buildProductRulesHref({
        ...filters,
        mutation: "error",
      }),
    );
  }
}

async function getLpProductRulesState(
  userId: string,
  filters: ProductRuleFilters,
  systemRole?: string,
): Promise<LpProductRulesState> {
  try {
    const memberships = await prisma.lpMembership.findMany({
      where: {
        userId,
      },
      orderBy: [{ lp: { name: "asc" } }],
      select: {
        id: true,
        role: true,
        lp: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (memberships.length === 0) {
      return { kind: "forbidden" };
    }

    const availableContexts: LpContextOption[] = memberships.map((membership) => ({
      membershipId: membership.id,
      lpId: membership.lp.id,
      lpName: membership.lp.name,
      lpCode: membership.lp.code,
      membershipRole: membership.role,
    }));

    const currentMembership =
      availableContexts.find((context) => context.lpId === filters.lpId) ??
      availableContexts[0];

    const canManageRules =
      systemRole === "ADMIN" ||
      MANAGEABLE_LP_ROLES.includes(currentMembership.membershipRole);

    const activeStatusFilter = ACTIVE_STATUS_OPTIONS.includes(
      filters.activeStatus as ActiveStatusFilter,
    )
      ? (filters.activeStatus as ActiveStatusFilter)
      : undefined;

    const categoryFilter: CategoryFilter | undefined = filters.category || undefined;

    const where = {
      lpId: currentMembership.lpId,
      ...(categoryFilter === UNLINKED_CATEGORY_FILTER
        ? { categoryRuleId: null }
        : categoryFilter
          ? { categoryRuleId: categoryFilter }
          : {}),
      ...(activeStatusFilter === "ACTIVE"
        ? { isActive: true }
        : activeStatusFilter === "INACTIVE"
          ? { isActive: false }
          : {}),
    };

    const [
      productRuleCount,
      activeProductRuleCount,
      linkedCategoryRuleCount,
      storeCoverageCount,
      categoryOptionsRaw,
      rows,
    ] = await Promise.all([
      prisma.productScaleRule.count({
        where: { lpId: currentMembership.lpId },
      }),
      prisma.productScaleRule.count({
        where: {
          lpId: currentMembership.lpId,
          isActive: true,
        },
      }),
      prisma.categoryRule.count({
        where: { lpId: currentMembership.lpId },
      }),
      prisma.storeLocationLpAssignment.count({
        where: {
          lpId: currentMembership.lpId,
          isActive: true,
        },
      }),
      prisma.categoryRule.findMany({
        where: {
          lpId: currentMembership.lpId,
        },
        orderBy: [{ categoryKey: "asc" }],
        select: {
          id: true,
          categoryKey: true,
          displayName: true,
        },
      }),
      prisma.productScaleRule.findMany({
        where,
        orderBy: [{ barcode: "asc" }],
        take: 100,
        select: {
          id: true,
          barcode: true,
          productNameSnapshot: true,
          productScale: true,
          isActive: true,
          effectiveFrom: true,
          effectiveTo: true,
          createdAt: true,
          updatedAt: true,
          categoryRule: {
            select: {
              id: true,
              categoryKey: true,
              displayName: true,
            },
          },
        },
      }),
    ]);

    const categoryOptions: CategoryOption[] = [
      ...categoryOptionsRaw.map((rule) => ({
        id: rule.id,
        label: rule.displayName
          ? `${rule.displayName} · ${rule.categoryKey}`
          : rule.categoryKey,
      })),
      {
        id: UNLINKED_CATEGORY_FILTER,
        label: "Unlinked rules",
      },
    ];

    const currentContext = {
      lpId: currentMembership.lpId,
      lpName: currentMembership.lpName,
      lpCode: currentMembership.lpCode,
      membershipRole: currentMembership.membershipRole,
      productRuleCount,
      activeProductRuleCount,
      linkedCategoryRuleCount,
      storeCoverageCount,
    };

    if (rows.length === 0) {
      return {
        kind: "empty",
        filters: {
          ...filters,
          lpId: currentMembership.lpId,
          ruleId: "",
        },
        canManageRules,
        currentContext,
        availableContexts,
        categoryOptions,
      };
    }

    const mappedRows: ProductRuleRow[] = rows.map((row) => ({
      id: row.id,
      barcode: row.barcode,
      productNameSnapshot: row.productNameSnapshot,
      categoryRuleId: row.categoryRule?.id ?? null,
      categoryKey: row.categoryRule?.categoryKey ?? null,
      categoryDisplayName: row.categoryRule?.displayName ?? null,
      productScale: formatDecimal(row.productScale),
      isActive: row.isActive,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    const selectedRule =
      mappedRows.find((row) => row.id === filters.ruleId) ?? mappedRows[0] ?? null;

    return {
      kind: "ready",
      filters: {
        ...filters,
        lpId: currentMembership.lpId,
        ruleId: selectedRule?.id ?? "",
      },
      canManageRules,
      currentContext,
      availableContexts,
      categoryOptions,
      rows: mappedRows,
      selectedRule,
    };
  } catch (error) {
    console.error("Failed to load LP product rules", error);

    return {
      kind: "error",
      message:
        "We could not load product scale rule data right now. Try again shortly or contact your VendorStream administrator.",
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
          LP access is required
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          This product scale rules surface is limited to LP-side VendorStream
          users with an assigned LP context.
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
          Product rules unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Product scale rules could not be loaded
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

export default async function LpProductRulesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    lpId?: string;
    category?: string;
    activeStatus?: string;
    ruleId?: string;
    mutation?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
          <ForbiddenState />
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filters: ProductRuleFilters = {
    lpId: resolvedSearchParams?.lpId?.trim() ?? "",
    category: resolvedSearchParams?.category?.trim() ?? "",
    activeStatus: resolvedSearchParams?.activeStatus?.trim() ?? "",
    ruleId: resolvedSearchParams?.ruleId?.trim() ?? "",
    mutation: resolvedSearchParams?.mutation?.trim() ?? "",
  };

  const state = await getLpProductRulesState(
    session.user.id,
    filters,
    session.user.systemRole,
  );
  const mutationBanner = getMutationBanner(filters.mutation);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              LP Product Scale Rules
            </div>
            {"currentContext" in state ? (
              <StatusBadge
                label={formatEnumLabel(state.currentContext.membershipRole)}
                className={getRoleTone(state.currentContext.membershipRole)}
              />
            ) : null}
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Product scale rules
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review product-scale overrides, linked category rules, and
              effective windows for the current LP workspace.
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

        {state.kind === "forbidden" ? <ForbiddenState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}

        {state.kind === "empty" || state.kind === "ready" ? (
          <div className="space-y-6">
            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Current LP context
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Product scale rules are scoped to the active LP membership
                  context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  <DetailRow label="LP" value={state.currentContext.lpName} />
                  <DetailRow
                    label="LP code"
                    value={state.currentContext.lpCode ?? "No code"}
                  />
                  <DetailRow
                    label="Membership role"
                    value={
                      <StatusBadge
                        label={formatEnumLabel(state.currentContext.membershipRole)}
                        className={getRoleTone(state.currentContext.membershipRole)}
                      />
                    }
                  />
                  <DetailRow
                    label="Store coverage"
                    value={String(state.currentContext.storeCoverageCount)}
                  />
                  <DetailRow
                    label="Product scale rules"
                    value={String(state.currentContext.productRuleCount)}
                  />
                  <DetailRow
                    label="Active product rules"
                    value={String(state.currentContext.activeProductRuleCount)}
                  />
                  <DetailRow
                    label="Linked category rules"
                    value={String(state.currentContext.linkedCategoryRuleCount)}
                  />
                  <DetailRow
                    label="Rule permissions"
                    value={state.canManageRules ? "Manage enabled" : "View only"}
                  />
                </div>

                {state.availableContexts.length > 1 ? (
                  <div className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                      Available LP contexts
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {state.availableContexts.map((context) => (
                        <Button
                          key={context.lpId}
                          asChild
                          size="sm"
                          variant="outline"
                          className={
                            context.lpId === state.currentContext.lpId
                              ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20"
                              : "border-white/15 bg-white/5 text-white hover:bg-white/10"
                          }
                        >
                          <Link
                            href={buildProductRulesHref({
                              lpId: context.lpId,
                              category: "",
                              activeStatus: "",
                              ruleId: "",
                              mutation: undefined,
                            })}
                          >
                            {context.lpName}
                          </Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-lg text-white">Filters</CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Narrow product scale rules by linked category rule or active
                  status.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4 xl:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-2">
                    <label
                      htmlFor="category"
                      className="text-sm font-medium text-slate-200"
                    >
                      Category
                    </label>
                    <select
                      id="category"
                      name="category"
                      defaultValue={state.filters.category}
                      className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                    >
                      <option value="" className="bg-slate-950 text-white">
                        All categories
                      </option>
                      {state.categoryOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          className="bg-slate-950 text-white"
                        >
                          {option.label}
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
                    <input type="hidden" name="lpId" value={state.currentContext.lpId} />
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
                        href={buildProductRulesHref({
                          lpId: state.currentContext.lpId,
                          category: "",
                          activeStatus: "",
                          ruleId: "",
                          mutation: undefined,
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
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Product scale rules
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Real `ProductScaleRule` records for the active LP workspace,
                      including linked category rule context where available.
                    </CardDescription>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                    <div className="font-medium text-white">Create rule</div>
                    <div>
                      TODO: wire the product-scale-rule creation flow once the
                      LP-side mutation forms are implemented.
                    </div>
                    <div className="pt-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!state.canManageRules}
                        className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                      >
                        Create product rule
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {state.kind === "empty" ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                    No product scale rules match the current LP context and filter
                    set.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                    <table className="min-w-full border-collapse text-left">
                      <thead className="border-b border-white/8 bg-white/5">
                        <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          <th className="px-4 py-3 font-medium">Barcode</th>
                          <th className="px-4 py-3 font-medium">
                            Product name snapshot
                          </th>
                          <th className="px-4 py-3 font-medium">Category</th>
                          <th className="px-4 py-3 font-medium">Product scale</th>
                          <th className="px-4 py-3 font-medium">Active status</th>
                          <th className="px-4 py-3 font-medium">Effective from</th>
                          <th className="px-4 py-3 font-medium">Effective to</th>
                          <th className="px-4 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.rows.map((row) => (
                          <tr
                            key={row.id}
                            className={`border-b border-white/8 last:border-b-0 ${
                              row.id === state.selectedRule?.id ? "bg-cyan-400/8" : ""
                            }`}
                          >
                            <td className="px-4 py-4 text-sm font-medium text-white">
                              {row.barcode}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {row.productNameSnapshot ?? "Not captured"}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {row.categoryDisplayName
                                ? `${row.categoryDisplayName} · ${row.categoryKey}`
                                : row.categoryKey ?? "Unlinked"}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {row.productScale}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              <StatusBadge
                                label={row.isActive ? "Active" : "Inactive"}
                                className={getActiveTone(row.isActive)}
                              />
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {formatDate(row.effectiveFrom)}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {formatDate(row.effectiveTo)}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled
                                  className="text-slate-300 disabled:text-slate-500"
                                >
                                  Edit rule
                                </Button>

                                <form action={toggleProductRuleStatus}>
                                  <input
                                    type="hidden"
                                    name="lpId"
                                    value={state.currentContext.lpId}
                                  />
                                  <input
                                    type="hidden"
                                    name="ruleId"
                                    value={row.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="categoryFilter"
                                    value={state.filters.category}
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
                                    disabled={!state.canManageRules}
                                    className={
                                      row.isActive
                                        ? "border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20 disabled:text-slate-500"
                                        : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20 disabled:text-slate-500"
                                    }
                                  >
                                    {row.isActive ? "Deactivate" : "Activate"}
                                  </Button>
                                </form>

                                {row.categoryRuleId ? (
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="outline"
                                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                  >
                                    <Link
                                      href={`/lp/rules/categories?lpId=${state.currentContext.lpId}&ruleId=${row.categoryRuleId}`}
                                    >
                                      View linked category rule
                                    </Link>
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled
                                    className="border-white/15 bg-white/5 text-white disabled:text-slate-500"
                                  >
                                    View linked category rule
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {state.kind === "ready" && state.selectedRule ? (
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">
                    Product rule details
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Review the selected product scale rule and linked category-rule
                    context.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 lg:grid-cols-2">
                  <DetailRow label="Rule ID" value={state.selectedRule.id} />
                  <DetailRow label="Barcode" value={state.selectedRule.barcode} />
                  <DetailRow
                    label="Product name snapshot"
                    value={state.selectedRule.productNameSnapshot ?? "Not captured"}
                  />
                  <DetailRow
                    label="Product scale"
                    value={state.selectedRule.productScale}
                  />
                  <DetailRow
                    label="Status"
                    value={
                      <StatusBadge
                        label={state.selectedRule.isActive ? "Active" : "Inactive"}
                        className={getActiveTone(state.selectedRule.isActive)}
                      />
                    }
                  />
                  <DetailRow
                    label="Category"
                    value={
                      state.selectedRule.categoryDisplayName
                        ? `${state.selectedRule.categoryDisplayName} · ${state.selectedRule.categoryKey}`
                        : state.selectedRule.categoryKey ?? "Unlinked"
                    }
                  />
                  <DetailRow
                    label="Effective from"
                    value={formatDate(state.selectedRule.effectiveFrom)}
                  />
                  <DetailRow
                    label="Effective to"
                    value={formatDate(state.selectedRule.effectiveTo)}
                  />
                  <DetailRow
                    label="Created at"
                    value={formatDateTime(state.selectedRule.createdAt)}
                  />
                  <DetailRow
                    label="Updated at"
                    value={formatDateTime(state.selectedRule.updatedAt)}
                  />
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
