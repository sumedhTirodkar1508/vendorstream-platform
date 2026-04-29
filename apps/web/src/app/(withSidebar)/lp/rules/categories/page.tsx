import Link from "next/link";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  prisma,
  recordAuditLog,
  type LpMembershipRole,
  Prisma,
} from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  canManageLpRules,
  MANAGEABLE_LP_RULE_ROLES,
} from "@/lib/lp-rule-management-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryRuleSelector } from "@/components/lp-rules/category-rule-selector";

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
  maxCommissionPercentInput: string;
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

const MANAGEABLE_LP_ROLES = MANAGEABLE_LP_RULE_ROLES;

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

function getEffectiveStatus(
  productIsActive: boolean,
  categoryIsActive: boolean,
) {
  if (!productIsActive) {
    return {
      label: "Inactive",
      tone: "border-red-400/30 bg-red-500/10 text-red-100",
    };
  }

  if (!categoryIsActive) {
    return {
      label: "Blocked by inactive category",
      tone: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    };
  }

  return {
    label: "Effective",
    tone: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  };
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

  if (mutation === "created") {
    return {
      tone: "success" as const,
      message: "Category rule created successfully.",
    };
  }

  if (mutation === "updated") {
    return {
      tone: "success" as const,
      message: "Category rule updated successfully.",
    };
  }

  if (mutation === "deleted") {
    return {
      tone: "success" as const,
      message: "Category rule deleted successfully.",
    };
  }

  if (mutation === "invalid") {
    return {
      tone: "warning" as const,
      message:
        "Check the category key, max scale, commission percent, and active state.",
    };
  }

  if (mutation === "duplicate") {
    return {
      tone: "warning" as const,
      message:
        "A category rule with that category key already exists for this LP.",
    };
  }

  if (mutation === "conflict") {
    return {
      tone: "warning" as const,
      message:
        "The category rule conflicts with the current rule configuration.",
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
      message:
        "You are not authorized to manage category rules in this LP context.",
    };
  }

  if (mutation === "error") {
    return {
      tone: "warning" as const,
      message:
        "The category rule action could not be completed. Try again shortly.",
    };
  }

  return null;
}

type CategoryRuleFormValues = {
  lpId: string;
  ruleId: string;
  categoryKey: string;
  displayName: string | null;
  maxScale: string;
  maxCommissionPercent: string;
  isActive: boolean;
};

function normalizeNumberInput(value: string) {
  return value.replace(/[%\s,]/g, "").trim();
}

function parsePositiveDecimalInput(value: string) {
  const trimmed = normalizeNumberInput(value);
  const parsed = Number(trimmed);

  if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed.toFixed(4);
}

function parseCommissionPercentInput(value: string) {
  const trimmed = normalizeNumberInput(value);
  const parsed = Number(trimmed);

  if (!trimmed || !Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed.toFixed(4);
}

function parseCategoryRuleForm(formData: FormData) {
  const lpId = String(formData.get("lpId") || "").trim();
  const ruleId = String(formData.get("ruleId") || "").trim();
  const categoryKey = String(formData.get("categoryKey") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim();
  const maxScale = parsePositiveDecimalInput(
    String(formData.get("maxScale") || ""),
  );
  const maxCommissionPercent = parseCommissionPercentInput(
    String(formData.get("maxCommissionPercent") || ""),
  );

  if (!lpId || !categoryKey || !maxScale || !maxCommissionPercent) {
    console.warn("category_rule.save.invalid", {
      keys: Array.from(formData.keys()),
      hasLpId: Boolean(lpId),
      hasRuleId: Boolean(ruleId),
      hasCategoryKey: Boolean(categoryKey),
      hasMaxScale: Boolean(maxScale),
      hasMaxCommissionPercent: Boolean(maxCommissionPercent),
      isActive: formData.get("isActive") === "on",
    });
    return null;
  }

  return {
    lpId,
    ruleId,
    categoryKey,
    displayName: displayName || null,
    maxScale,
    maxCommissionPercent,
    isActive: formData.get("isActive") === "on",
  } satisfies CategoryRuleFormValues;
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function addChangedField(
  changedFields: Record<
    string,
    { previous: string | boolean | null; next: string | boolean | null }
  >,
  fieldName: string,
  previous: string | boolean | null,
  next: string | boolean | null,
) {
  if (previous !== next) {
    changedFields[fieldName] = {
      previous,
      next,
    };
  }
}

async function saveCategoryRule(formData: FormData) {
  "use server";

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const parsed = parseCategoryRuleForm(formData);
  const lpId = String(formData.get("lpId") || "").trim();
  const ruleId = String(formData.get("ruleId") || "").trim();

  const filters = {
    lpId,
    ruleId,
  };

  if (!parsed) {
    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "invalid",
      }),
    );
  }

  const actorUserId = session.user.id;

  if (!actorUserId) {
    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "forbidden",
      }),
    );
  }

  if (
    !(await canManageLpRules({
      actor: {
        userId: actorUserId,
        systemRole: session.user.systemRole,
      },
      lpId: parsed.lpId,
    }))
  ) {
    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "forbidden",
      }),
    );
  }

  let result:
    | { status: "created" | "updated"; ruleId: string }
    | { status: "duplicate" | "not_found"; ruleId: string };

  try {
    result = await prisma.$transaction(async (tx) => {
      const duplicateRule = await tx.categoryRule.findFirst({
        where: {
          lpId: parsed.lpId,
          categoryKey: parsed.categoryKey,
          ...(parsed.ruleId ? { NOT: { id: parsed.ruleId } } : {}),
        },
        select: {
          id: true,
        },
      });

      if (duplicateRule) {
        return {
          status: "duplicate" as const,
          ruleId: parsed.ruleId,
        };
      }

      if (parsed.ruleId) {
        const existingRule = await tx.categoryRule.findFirst({
          where: {
            id: parsed.ruleId,
            lpId: parsed.lpId,
          },
          select: {
            id: true,
            categoryKey: true,
            displayName: true,
            maxScale: true,
            maxCommissionPercent: true,
            isActive: true,
          },
        });

        if (!existingRule) {
          return {
            status: "not_found" as const,
            ruleId: parsed.ruleId,
          };
        }

        await tx.categoryRule.update({
          where: {
            id: parsed.ruleId,
          },
          data: {
            categoryKey: parsed.categoryKey,
            displayName: parsed.displayName,
            maxScale: parsed.maxScale,
            maxCommissionPercent: parsed.maxCommissionPercent,
            isActive: parsed.isActive,
          },
        });

        const changedFields: Record<
          string,
          { previous: string | boolean | null; next: string | boolean | null }
        > = {};

        addChangedField(
          changedFields,
          "categoryKey",
          existingRule.categoryKey,
          parsed.categoryKey,
        );
        addChangedField(
          changedFields,
          "displayName",
          existingRule.displayName,
          parsed.displayName,
        );
        addChangedField(
          changedFields,
          "maxScale",
          existingRule.maxScale.toFixed(4),
          parsed.maxScale,
        );
        addChangedField(
          changedFields,
          "maxCommissionPercent",
          existingRule.maxCommissionPercent.toFixed(4),
          parsed.maxCommissionPercent,
        );
        addChangedField(
          changedFields,
          "isActive",
          existingRule.isActive,
          parsed.isActive,
        );

        await recordAuditLog(tx, {
          actorType: "USER",
          actorUserId,
          action: "category_rule.updated",
          entityType: "CATEGORY_RULE",
          entityId: parsed.ruleId,
          metadata: {
            lpId: parsed.lpId,
            ruleId: parsed.ruleId,
            categoryKey: parsed.categoryKey,
            changedFields,
          },
        });

        if (existingRule.isActive !== parsed.isActive) {
          await recordAuditLog(tx, {
            actorType: "USER",
            actorUserId,
            action: parsed.isActive
              ? "category_rule.activated"
              : "category_rule.deactivated",
            entityType: "CATEGORY_RULE",
            entityId: parsed.ruleId,
            metadata: {
              lpId: parsed.lpId,
              ruleId: parsed.ruleId,
              categoryKey: parsed.categoryKey,
              previousActiveState: existingRule.isActive,
              nextActiveState: parsed.isActive,
            },
          });
        }

        return {
          status: "updated" as const,
          ruleId: parsed.ruleId,
        };
      }

      const savedRule = await tx.categoryRule.create({
        data: {
          lpId: parsed.lpId,
          categoryKey: parsed.categoryKey,
          displayName: parsed.displayName,
          maxScale: parsed.maxScale,
          maxCommissionPercent: parsed.maxCommissionPercent,
          isActive: parsed.isActive,
        },
        select: {
          id: true,
        },
      });

      await recordAuditLog(tx, {
        actorType: "USER",
        actorUserId,
        action: "category_rule.created",
        entityType: "CATEGORY_RULE",
        entityId: savedRule.id,
        metadata: {
          lpId: parsed.lpId,
          ruleId: savedRule.id,
          categoryKey: parsed.categoryKey,
          isActive: parsed.isActive,
        },
      });

      return {
        status: "created" as const,
        ruleId: savedRule.id,
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(
        buildCategoryRulesHref({
          ...filters,
          mutation: "duplicate",
        }),
      );
    }

    console.error("Failed to save category rule", error);

    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "error",
      }),
    );
  }

  if (result.status === "duplicate" || result.status === "not_found") {
    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: result.status,
      }),
    );
  }

  revalidatePath("/lp/rules/categories");
  redirect(
    buildCategoryRulesHref({
      lpId: parsed.lpId,
      ruleId: result.ruleId,
      mutation: result.status,
    }),
  );
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

  const actorUserId = session.user.id;

  if (!actorUserId) {
    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "forbidden",
      }),
    );
  }

  if (
    !(await canManageLpRules({
      actor: {
        userId: actorUserId,
        systemRole: session.user.systemRole,
      },
      lpId,
    }))
  ) {
    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "forbidden",
      }),
    );
  }

  let result: { status: "activated" | "deactivated" | "not_found" };

  try {
    result = await prisma.$transaction(async (tx) => {
      const rule = await tx.categoryRule.findFirst({
        where: {
          id: ruleId,
          lpId,
        },
        select: {
          id: true,
          categoryKey: true,
          isActive: true,
        },
      });

      if (!rule) {
        return {
          status: "not_found" as const,
        };
      }

      const nextIsActive = nextStatus === "ACTIVE";

      await tx.categoryRule.update({
        where: { id: ruleId },
        data: {
          isActive: nextIsActive,
        },
      });

      await recordAuditLog(tx, {
        actorType: "USER",
        actorUserId,
        action: nextIsActive
          ? "category_rule.activated"
          : "category_rule.deactivated",
        entityType: "CATEGORY_RULE",
        entityId: ruleId,
        metadata: {
          lpId,
          ruleId,
          categoryKey: rule.categoryKey,
          previousActiveState: rule.isActive,
          nextActiveState: nextIsActive,
        },
      });

      return {
        status: nextIsActive
          ? ("activated" as const)
          : ("deactivated" as const),
      };
    });
  } catch (error) {
    console.error("Failed to update category rule status", error);

    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "error",
      }),
    );
  }

  if (result.status === "not_found") {
    redirect(
      buildCategoryRulesHref({
        ...filters,
        mutation: "not_found",
      }),
    );
  }

  revalidatePath("/lp/rules/categories");
  redirect(
    buildCategoryRulesHref({
      ...filters,
      mutation: result.status,
    }),
  );
}

async function deleteCategoryRule(formData: FormData) {
  "use server";

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const lpId = String(formData.get("lpId") || "").trim();
  const ruleId = String(formData.get("ruleId") || "").trim();

  if (!lpId || !ruleId) {
    redirect(
      buildCategoryRulesHref({
        lpId,
        ruleId,
        mutation: "invalid",
      }),
    );
  }

  const actorUserId = session.user.id;

  if (!actorUserId) {
    redirect(
      buildCategoryRulesHref({
        lpId,
        ruleId,
        mutation: "forbidden",
      }),
    );
  }

  if (
    !(await canManageLpRules({
      actor: {
        userId: actorUserId,
        systemRole: session.user.systemRole,
      },
      lpId,
    }))
  ) {
    redirect(
      buildCategoryRulesHref({
        lpId,
        ruleId,
        mutation: "forbidden",
      }),
    );
  }

  let result: { status: "deleted" | "not_found" };

  try {
    result = await prisma.$transaction(async (tx) => {
      const rule = await tx.categoryRule.findFirst({
        where: {
          id: ruleId,
          lpId,
        },
        select: {
          id: true,
          categoryKey: true,
          isActive: true,
        },
      });

      if (!rule) {
        return { status: "not_found" as const };
      }

      await tx.categoryRule.delete({
        where: { id: ruleId },
      });

      await recordAuditLog(tx, {
        actorType: "USER",
        actorUserId,
        action: "category_rule.deleted",
        entityType: "CATEGORY_RULE",
        entityId: ruleId,
        metadata: {
          lpId,
          ruleId,
          categoryKey: rule.categoryKey,
          previousActiveState: rule.isActive,
        },
      });

      return { status: "deleted" as const };
    });
  } catch (error) {
    console.error("Failed to delete category rule", error);

    redirect(
      buildCategoryRulesHref({
        lpId,
        ruleId,
        mutation: "error",
      }),
    );
  }

  if (result.status === "not_found") {
    redirect(
      buildCategoryRulesHref({
        lpId,
        ruleId,
        mutation: "not_found",
      }),
    );
  }

  revalidatePath("/lp/rules/categories");
  redirect(
    buildCategoryRulesHref({
      lpId,
      ruleId: "",
      mutation: "deleted",
    }),
  );
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

    const availableContexts: LpContextOption[] = memberships.map(
      (membership) => ({
        membershipId: membership.id,
        lpId: membership.lp.id,
        lpName: membership.lp.name,
        lpCode: membership.lp.code,
        membershipRole: membership.role,
      }),
    );

    const currentMembership =
      availableContexts.find((context) => context.lpId === filters.lpId) ??
      availableContexts[0];

    const canManageRules =
      systemRole === "ADMIN" ||
      MANAGEABLE_LP_ROLES.includes(currentMembership.membershipRole);

    const [
      categoryRuleCount,
      activeCategoryRuleCount,
      productScaleRuleCount,
      storeCoverageCount,
      rows,
    ] = await Promise.all([
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
      mappedRows.find((row) => row.id === filters.ruleId)?.id ??
      mappedRows[0]?.id ??
      "";

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
          maxCommissionPercentInput: formatDecimal(
            selectedRuleSource.maxCommissionPercent,
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
  const selectedRule = state.kind === "ready" ? state.selectedRule : null;

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
                  <DetailRow label="LP" value={state.currentContext.lpName} />
                  <DetailRow
                    label="LP code"
                    value={state.currentContext.lpCode ?? "No code"}
                  />
                  <DetailRow
                    label="Membership role"
                    value={
                      <StatusBadge
                        label={formatEnumLabel(
                          state.currentContext.membershipRole,
                        )}
                        className={getRoleTone(
                          state.currentContext.membershipRole,
                        )}
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
                    value={
                      state.canManageRules ? "Manage enabled" : "View only"
                    }
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
                  <form
                    id="category-rule-create-form"
                    action={saveCategoryRule}
                    className="grid min-w-72 gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100"
                  >
                    <input
                      type="hidden"
                      name="lpId"
                      form="category-rule-create-form"
                      value={state.currentContext.lpId}
                    />
                    <div className="font-medium text-white">Create rule</div>
                    <input
                      name="categoryKey"
                      form="category-rule-create-form"
                      required
                      placeholder="Category key"
                      className="h-10 rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
                    />
                    <input
                      name="displayName"
                      form="category-rule-create-form"
                      placeholder="Display name"
                      className="h-10 rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        name="maxScale"
                        form="category-rule-create-form"
                        required
                        inputMode="decimal"
                        placeholder="Max scale"
                        className="h-10 rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
                      />
                      <input
                        name="maxCommissionPercent"
                        form="category-rule-create-form"
                        required
                        inputMode="decimal"
                        placeholder="Max commission %"
                        className="h-10 rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-cyan-100">
                      <input
                        type="checkbox"
                        name="isActive"
                        form="category-rule-create-form"
                        defaultChecked
                        className="size-4 accent-cyan-300"
                      />
                      Active
                    </label>
                    <Button
                      type="submit"
                      form="category-rule-create-form"
                      size="sm"
                      disabled={!state.canManageRules}
                      className="bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                    >
                      Create category rule
                    </Button>
                  </form>
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
                          <th className="px-4 py-3 font-medium">
                            Category key
                          </th>
                          <th className="px-4 py-3 font-medium">
                            Display name
                          </th>
                          <th className="px-4 py-3 font-medium">Max scale</th>
                          <th className="px-4 py-3 font-medium">
                            Max commission percent
                          </th>
                          <th className="px-4 py-3 font-medium">
                            Active status
                          </th>
                          <th className="px-4 py-3 font-medium">
                            Effective from
                          </th>
                          <th className="px-4 py-3 font-medium">
                            Effective to
                          </th>
                          <th className="px-4 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.rows.map((row) => (
                          <tr
                            key={row.id}
                            className={`border-b border-white/8 last:border-b-0 ${
                              row.id === state.selectedRule?.id
                                ? "bg-cyan-400/8"
                                : ""
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
                                <form
                                  id={`category-rule-delete-form-${row.id}`}
                                  action={deleteCategoryRule}
                                >
                                  <input
                                    type="hidden"
                                    name="lpId"
                                    form={`category-rule-delete-form-${row.id}`}
                                    value={state.currentContext.lpId}
                                  />
                                  <input
                                    type="hidden"
                                    name="ruleId"
                                    form={`category-rule-delete-form-${row.id}`}
                                    value={row.id}
                                  />
                                  <Button
                                    type="submit"
                                    form={`category-rule-delete-form-${row.id}`}
                                    size="sm"
                                    variant="outline"
                                    disabled={!state.canManageRules}
                                    className="border-red-400/20 bg-red-500/10 text-red-100 hover:bg-red-500/20 disabled:text-slate-500"
                                  >
                                    Delete rule
                                  </Button>
                                </form>

                                <form
                                  id={`category-rule-toggle-row-form-${row.id}`}
                                  action={toggleCategoryRuleStatus}
                                >
                                  <input
                                    type="hidden"
                                    name="lpId"
                                    form={`category-rule-toggle-row-form-${row.id}`}
                                    value={state.currentContext.lpId}
                                  />
                                  <input
                                    type="hidden"
                                    name="ruleId"
                                    form={`category-rule-toggle-row-form-${row.id}`}
                                    value={row.id}
                                  />
                                  <Button
                                    type="submit"
                                    form={`category-rule-toggle-row-form-${row.id}`}
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
                                    href={`/lp/rules/products?lpId=${state.currentContext.lpId}&category=${row.id}`}
                                  >
                                    View product rules
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

            {state.kind === "ready" && selectedRule ? (
              <div className="space-y-4">
                <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-lg text-white">
                      Selected category rule
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">
                      Choose a category rule to view details, related product
                      rules, and edit actions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CategoryRuleSelector
                      lpId={state.currentContext.lpId}
                      selectedRuleId={state.selectedRule?.id ?? ""}
                      rules={state.rows.map((row) => ({
                        id: row.id,
                        label: row.displayName ?? row.categoryKey,
                        isActive: row.isActive,
                      }))}
                    />
                  </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
                  <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                    <CardHeader className="space-y-2">
                      <CardTitle className="text-xl text-white">
                        Category rule details
                      </CardTitle>
                      <CardDescription className="text-sm leading-6 text-slate-300">
                        Review the selected category rule and linked
                        product-scale coverage.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      <DetailRow label="Rule ID" value={selectedRule.id} />
                      <DetailRow
                        label="Category key"
                        value={selectedRule.categoryKey}
                      />
                      <DetailRow
                        label="Display name"
                        value={selectedRule.displayName ?? "Not set"}
                      />
                      <DetailRow
                        label="Max scale"
                        value={selectedRule.maxScale}
                      />
                      <DetailRow
                        label="Max commission percent"
                        value={selectedRule.maxCommissionPercent}
                      />
                      <DetailRow
                        label="Status"
                        value={
                          <StatusBadge
                            label={
                              selectedRule.isActive ? "Active" : "Inactive"
                            }
                            className={getActiveTone(selectedRule.isActive)}
                          />
                        }
                      />
                      <DetailRow
                        label="Effective from"
                        value={formatDate(selectedRule.effectiveFrom)}
                      />
                      <DetailRow
                        label="Effective to"
                        value={formatDate(selectedRule.effectiveTo)}
                      />
                      <DetailRow
                        label="Related product rules"
                        value={String(selectedRule.productScaleRuleCount)}
                      />
                      <DetailRow
                        label="Created at"
                        value={formatDateTime(selectedRule.createdAt)}
                      />
                      <DetailRow
                        label="Updated at"
                        value={formatDateTime(selectedRule.updatedAt)}
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
                          Product-scale rules currently linked to this category
                          rule.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {!selectedRule.isActive ? (
                          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                            This category is inactive. Linked product rules are
                            preserved but unavailable for reconciliation until
                            the category is reactivated.
                          </div>
                        ) : null}
                        {selectedRule.productRules.length > 0 ? (
                          selectedRule.productRules.map((rule) => {
                            const effectiveStatus = getEffectiveStatus(
                              rule.isActive,
                              selectedRule.isActive,
                            );

                            return (
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
                                  <div className="flex flex-col items-end gap-2">
                                    <StatusBadge
                                      label={
                                        rule.isActive ? "Active" : "Inactive"
                                      }
                                      className={getActiveTone(rule.isActive)}
                                    />
                                    <StatusBadge
                                      label={effectiveStatus.label}
                                      className={effectiveStatus.tone}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })
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
                          Update the selected category rule for this LP
                          workspace.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <form
                          id="category-rule-edit-form"
                          action={saveCategoryRule}
                          className="grid gap-3"
                        >
                          <input
                            type="hidden"
                            name="lpId"
                            form="category-rule-edit-form"
                            value={state.currentContext.lpId}
                          />
                          <input
                            type="hidden"
                            name="ruleId"
                            form="category-rule-edit-form"
                            value={selectedRule.id}
                          />
                          <input
                            name="categoryKey"
                            form="category-rule-edit-form"
                            required
                            defaultValue={selectedRule.categoryKey}
                            className="h-10 rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
                          />
                          <input
                            name="displayName"
                            form="category-rule-edit-form"
                            defaultValue={selectedRule.displayName ?? ""}
                            className="h-10 rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
                          />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <input
                              name="maxScale"
                              form="category-rule-edit-form"
                              required
                              inputMode="decimal"
                              defaultValue={selectedRule.maxScale}
                              className="h-10 rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
                            />
                            <input
                              name="maxCommissionPercent"
                              form="category-rule-edit-form"
                              required
                              inputMode="decimal"
                              defaultValue={
                                selectedRule.maxCommissionPercentInput
                              }
                              className="h-10 rounded-md border border-white/10 bg-slate-950/70 px-3 text-sm text-white outline-none focus:border-cyan-300/40"
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              name="isActive"
                              form="category-rule-edit-form"
                              defaultChecked={selectedRule.isActive}
                              className="size-4 accent-cyan-300"
                            />
                            Active
                          </label>
                          <Button
                            type="submit"
                            form="category-rule-edit-form"
                            disabled={!state.canManageRules}
                            className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300 disabled:bg-white/20 disabled:text-slate-400"
                          >
                            Save category rule
                          </Button>
                        </form>

                        {selectedRule.productScaleRuleCount > 0 ? (
                          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                            Deactivating this category will make{" "}
                            {selectedRule.productScaleRuleCount} linked product
                            rule(s) unavailable for reconciliation. Their own
                            active/inactive states will be preserved.
                          </div>
                        ) : null}

                        <form
                          id="category-rule-toggle-form"
                          action={toggleCategoryRuleStatus}
                        >
                          <input
                            type="hidden"
                            name="lpId"
                            form="category-rule-toggle-form"
                            value={state.currentContext.lpId}
                          />
                          <input
                            type="hidden"
                            name="ruleId"
                            form="category-rule-toggle-form"
                            value={selectedRule.id}
                          />
                          <Button
                            type="submit"
                            form="category-rule-toggle-form"
                            name="nextStatus"
                            value={
                              selectedRule.isActive ? "INACTIVE" : "ACTIVE"
                            }
                            disabled={!state.canManageRules}
                            className={
                              selectedRule.isActive
                                ? "w-full bg-red-500 text-white hover:bg-red-400 disabled:bg-white/20 disabled:text-slate-400"
                                : "w-full bg-emerald-500 text-white hover:bg-emerald-400 disabled:bg-white/20 disabled:text-slate-400"
                            }
                          >
                            {selectedRule.isActive
                              ? "Deactivate category rule"
                              : "Activate category rule"}
                          </Button>
                        </form>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
