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

type CategoryRuleFilters = {
  lpId: string;
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

type ProductRuleRow = {
  id: string;
  barcode: string;
  productNameSnapshot: string | null;
  productScale: string;
  isActive: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};

type CategoryRuleRow = {
  id: string;
  categoryKey: string;
  displayName: string | null;
  maxScale: string;
  maxCommissionPercent: string;
  isActive: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  productScaleRuleCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type SelectedCategoryRule = CategoryRuleRow & {
  productRules: ProductRuleRow[];
};

type LpCategoryRulesState =
  | {
      kind: "ready";
      filters: CategoryRuleFilters;
      canManageRules: boolean;
      currentContext: {
        lpId: string;
        lpName: string;
        lpCode: string | null;
        membershipRole: LpMembershipRole;
        categoryRuleCount: number;
        activeCategoryRuleCount: number;
        productScaleRuleCount: number;
        storeCoverageCount: number;
      };
      availableContexts: LpContextOption[];
      rows: CategoryRuleRow[];
      selectedRule: SelectedCategoryRule | null;
    }
  | {
      kind: "empty";
      filters: CategoryRuleFilters;
      canManageRules: boolean;
      currentContext: {
        lpId: string;
        lpName: string;
        lpCode: string | null;
        membershipRole: LpMembershipRole;
        categoryRuleCount: number;
        activeCategoryRuleCount: number;
        productScaleRuleCount: number;
        storeCoverageCount: number;
      };
      availableContexts: LpContextOption[];
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "error";
      message: string;
    };

const MANAGEABLE_LP_ROLES: LpMembershipRole[] = ["LP_ADMIN", "LP_MANAGER"];

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

function buildCategoryRulesHref(
  filters: Omit<CategoryRuleFilters, "mutation"> & { mutation?: string },
) {
  const params = new URLSearchParams();

  if (filters.lpId) {
    params.set("lpId", filters.lpId);
  }

  if (filters.ruleId) {
    params.set("ruleId", filters.ruleId);
  }

  if (filters.mutation) {
    params.set("mutation", filters.mutation);
  }

  const query = params.toString();
  return query ? `/lp/rules/categories?${query}` : "/lp/rules/categories";
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
      message: "Category rule activated successfully.",
    };
  }

  if (mutation === "deactivated") {
    return {
      tone: "success" as const,
      message: "Category rule deactivated successfully.",
    };
  }

  if (mutation === "invalid") {
    return {
      tone: "warning" as const,
      message: "The submitted category rule action was invalid.",
    };
  }

  if (mutation === "not_found") {
    return {
      tone: "warning" as const,
      message: "The selected category rule could not be found.",
    };
  }

  if (mutation === "forbidden") {
    return {
      tone: "warning" as const,
      message: "You are not authorized to manage category rules in this LP context.",
    };
  }

  if (mutation === "error") {
    return {
      tone: "warning" as const,
      message: "The category rule action could not be completed. Try again shortly.",
    };
  }

  return null;
}

async function toggleCategoryRuleStatus(formData: FormData) {
  "use server";

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const lpId = String(formData.get("lpId") || "").trim();
  const ruleId = String(formData.get("ruleId") || "").trim();
  const nextStatus = String(formData.get("nextStatus") || "").trim();

  const filters = {
    lpId,
    ruleId,
  };

  if (!lpId || !ruleId || !["ACTIVE", "INACTIVE"].includes(nextStatus)) {
    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "invalid",
      }),
    );
  }

  if (!session.user.id) {
    redirect(
      buildCategoryRulesHref({
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
      buildCategoryRulesHref({
        ...filters,
        mutation: "forbidden",
      }),
    );
  }

  try {
    const rule = await prisma.categoryRule.findFirst({
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
        buildCategoryRulesHref({
          ...filters,
          mutation: "not_found",
        }),
      );
    }

    await prisma.categoryRule.update({
      where: { id: ruleId },
      data: {
        isActive: nextStatus === "ACTIVE",
      },
    });

    revalidatePath("/lp/rules/categories");

    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: nextStatus === "ACTIVE" ? "activated" : "deactivated",
      }),
    );
  } catch (error) {
    console.error("Failed to update category rule status", error);

    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "error",
      }),
    );
  }
}

async function getLpCategoryRulesState(
  userId: string,
  filters: CategoryRuleFilters,
  systemRole?: string,
): Promise<LpCategoryRulesState> {
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

    const [categoryRuleCount, activeCategoryRuleCount, productScaleRuleCount, storeCoverageCount, rows] =
      await Promise.all([
        prisma.categoryRule.count({
          where: { lpId: currentMembership.lpId },
        }),
        prisma.categoryRule.count({
          where: {
            lpId: currentMembership.lpId,
            isActive: true,
          },
        }),
        prisma.productScaleRule.count({
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
          take: 50,
          select: {
            id: true,
            categoryKey: true,
            displayName: true,
            maxScale: true,
            maxCommissionPercent: true,
            isActive: true,
            effectiveFrom: true,
            effectiveTo: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                productScaleRules: true,
              },
            },
          },
        }),
      ]);

    const currentContext = {
      lpId: currentMembership.lpId,
      lpName: currentMembership.lpName,
      lpCode: currentMembership.lpCode,
      membershipRole: currentMembership.membershipRole,
      categoryRuleCount,
      activeCategoryRuleCount,
      productScaleRuleCount,
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
      };
    }

    const mappedRows: CategoryRuleRow[] = rows.map((row) => ({
      id: row.id,
      categoryKey: row.categoryKey,
      displayName: row.displayName,
      maxScale: formatDecimal(row.maxScale),
      maxCommissionPercent: formatDecimal(row.maxCommissionPercent, "%"),
      isActive: row.isActive,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      productScaleRuleCount: row._count.productScaleRules,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    const selectedRuleId =
      mappedRows.find((row) => row.id === filters.ruleId)?.id ?? mappedRows[0]?.id ?? "";

    const selectedRuleSource = await prisma.categoryRule.findFirst({
      where: {
        id: selectedRuleId,
        lpId: currentMembership.lpId,
      },
      select: {
        id: true,
        categoryKey: true,
        displayName: true,
        maxScale: true,
        maxCommissionPercent: true,
        isActive: true,
        effectiveFrom: true,
        effectiveTo: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            productScaleRules: true,
          },
        },
        productScaleRules: {
          orderBy: [{ barcode: "asc" }],
          take: 12,
          select: {
            id: true,
            barcode: true,
            productNameSnapshot: true,
            productScale: true,
            isActive: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
        },
      },
    });

    const selectedRule = selectedRuleSource
      ? {
          id: selectedRuleSource.id,
          categoryKey: selectedRuleSource.categoryKey,
          displayName: selectedRuleSource.displayName,
          maxScale: formatDecimal(selectedRuleSource.maxScale),
          maxCommissionPercent: formatDecimal(
            selectedRuleSource.maxCommissionPercent,
            "%",
          ),
          isActive: selectedRuleSource.isActive,
          effectiveFrom: selectedRuleSource.effectiveFrom,
          effectiveTo: selectedRuleSource.effectiveTo,
          productScaleRuleCount: selectedRuleSource._count.productScaleRules,
          createdAt: selectedRuleSource.createdAt,
          updatedAt: selectedRuleSource.updatedAt,
          productRules: selectedRuleSource.productScaleRules.map((rule) => ({
            id: rule.id,
            barcode: rule.barcode,
            productNameSnapshot: rule.productNameSnapshot,
            productScale: formatDecimal(rule.productScale),
            isActive: rule.isActive,
            effectiveFrom: rule.effectiveFrom,
            effectiveTo: rule.effectiveTo,
          })),
        }
      : null;

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
      rows: mappedRows,
      selectedRule,
    };
  } catch (error) {
    console.error("Failed to load LP category rules", error);

    return {
      kind: "error",
      message:
        "We could not load category rule data right now. Try again shortly or contact your VendorStream administrator.",
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
          This category rules surface is limited to LP-side VendorStream users
          with an assigned LP context.
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
          Category rules unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          Category rules could not be loaded
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

export default async function LpCategoryRulesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    lpId?: string;
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
  const filters: CategoryRuleFilters = {
    lpId: resolvedSearchParams?.lpId?.trim() ?? "",
    ruleId: resolvedSearchParams?.ruleId?.trim() ?? "",
    mutation: resolvedSearchParams?.mutation?.trim() ?? "",
  };

  const state = await getLpCategoryRulesState(
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
              LP Category Rules
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
              Category-based commission rules
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review category-level commission caps, effective windows, and
              linked product-scale rules for the current LP workspace.
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
                  Rules are scoped to the active LP membership context.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  <DetailRow
                    label="LP"
                    value={state.currentContext.lpName}
                  />
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
                    label="Category rules"
                    value={String(state.currentContext.categoryRuleCount)}
                  />
                  <DetailRow
                    label="Active category rules"
                    value={String(state.currentContext.activeCategoryRuleCount)}
                  />
                  <DetailRow
                    label="Product scale rules"
                    value={String(state.currentContext.productScaleRuleCount)}
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
                            href={buildCategoryRulesHref({
                              lpId: context.lpId,
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
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Category rules
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Real `CategoryRule` records for the active LP workspace.
                    </CardDescription>
                  </div>
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                    <div className="font-medium text-white">Create rule</div>
                    <div>
                      TODO: wire the category-rule creation flow once the LP-side
                      rule mutation forms are implemented.
                    </div>
                    <div className="pt-3">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!state.canManageRules}
                        className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                      >
                        Create category rule
                      </Button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {state.kind === "empty" ? (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                    No category rules are currently configured for this LP
                    context.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                    <table className="min-w-full border-collapse text-left">
                      <thead className="border-b border-white/8 bg-white/5">
                        <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          <th className="px-4 py-3 font-medium">Category key</th>
                          <th className="px-4 py-3 font-medium">Display name</th>
                          <th className="px-4 py-3 font-medium">Max scale</th>
                          <th className="px-4 py-3 font-medium">
                            Max commission percent
                          </th>
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
                              {row.categoryKey}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {row.displayName ?? "Not set"}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {row.maxScale}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-300">
                              {row.maxCommissionPercent}
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

                                <form action={toggleCategoryRuleStatus}>
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

                                <Button
                                  asChild
                                  size="sm"
                                  variant="outline"
                                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                >
                                  <Link
                                    href={buildCategoryRulesHref({
                                      lpId: state.currentContext.lpId,
                                      ruleId: row.id,
                                      mutation: undefined,
                                    })}
                                  >
                                    View related product rules
                                  </Link>
                                </Button>
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
              <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-xl text-white">
                      Category rule details
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Review the selected category rule and linked product-scale
                      coverage.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <DetailRow label="Rule ID" value={state.selectedRule.id} />
                    <DetailRow
                      label="Category key"
                      value={state.selectedRule.categoryKey}
                    />
                    <DetailRow
                      label="Display name"
                      value={state.selectedRule.displayName ?? "Not set"}
                    />
                    <DetailRow
                      label="Max scale"
                      value={state.selectedRule.maxScale}
                    />
                    <DetailRow
                      label="Max commission percent"
                      value={state.selectedRule.maxCommissionPercent}
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
                      label="Effective from"
                      value={formatDate(state.selectedRule.effectiveFrom)}
                    />
                    <DetailRow
                      label="Effective to"
                      value={formatDate(state.selectedRule.effectiveTo)}
                    />
                    <DetailRow
                      label="Related product rules"
                      value={String(state.selectedRule.productScaleRuleCount)}
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

                <div className="grid gap-4">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Related product rules
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Product-scale rules currently linked to this category rule.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.selectedRule.productRules.length > 0 ? (
                        state.selectedRule.productRules.map((rule) => (
                          <div
                            key={rule.id}
                            className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium text-white">
                                  {rule.productNameSnapshot || rule.barcode}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {rule.barcode} · scale {rule.productScale}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {formatDate(rule.effectiveFrom)} to{" "}
                                  {formatDate(rule.effectiveTo)}
                                </div>
                              </div>
                              <StatusBadge
                                label={rule.isActive ? "Active" : "Inactive"}
                                className={getActiveTone(rule.isActive)}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <EmptyListState label="related product rules" />
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Rule actions
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Activation is available now. Create and edit flows can be
                        connected when LP-side rule mutations are implemented.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <form action={toggleCategoryRuleStatus}>
                        <input
                          type="hidden"
                          name="lpId"
                          value={state.currentContext.lpId}
                        />
                        <input
                          type="hidden"
                          name="ruleId"
                          value={state.selectedRule.id}
                        />
                        <Button
                          type="submit"
                          name="nextStatus"
                          value={state.selectedRule.isActive ? "INACTIVE" : "ACTIVE"}
                          disabled={!state.canManageRules}
                          className={
                            state.selectedRule.isActive
                              ? "w-full bg-red-500 text-white hover:bg-red-400 disabled:bg-white/20 disabled:text-slate-400"
                              : "w-full bg-emerald-500 text-white hover:bg-emerald-400 disabled:bg-white/20 disabled:text-slate-400"
                          }
                        >
                          {state.selectedRule.isActive
                            ? "Deactivate category rule"
                            : "Activate category rule"}
                        </Button>
                      </form>

                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Edit rule
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        disabled
                        className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                      >
                        Create category rule
                      </Button>

                      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                        TODO: connect create-rule and edit-rule flows once the
                        corresponding LP-side mutation routes are implemented.
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
