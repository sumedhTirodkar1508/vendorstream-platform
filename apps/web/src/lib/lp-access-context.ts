import { prisma } from "@vendorstream/database";

type AppSystemRole = "USER" | "ADMIN" | "FINANCE_VIEWER" | undefined;

export type LpAccessOption = {
  lpId: string;
  lpName: string;
  lpCode: string | null;
};

export type LpAccessContext = {
  options: LpAccessOption[];
  lpIds: string[];
  primaryLpName: string | null;
  displayName: string;
  totalLps: number;
  isFallbackContext: boolean;
};

function buildLpContext(
  options: LpAccessOption[],
  isFallbackContext: boolean,
): LpAccessContext {
  const sortedOptions = [...options].sort((a, b) => a.lpName.localeCompare(b.lpName));
  const lpIds = sortedOptions.map((option) => option.lpId);
  const primaryLpName = sortedOptions[0]?.lpName ?? null;

  return {
    options: sortedOptions,
    lpIds,
    primaryLpName,
    displayName:
      sortedOptions.length === 1
        ? (primaryLpName ?? "LP workspace")
        : `${sortedOptions.length} LP workspaces`,
    totalLps: sortedOptions.length,
    isFallbackContext,
  };
}

export async function getLpAccessContextForUser({
  userId,
  systemRole,
}: {
  userId: string;
  systemRole?: AppSystemRole;
}): Promise<LpAccessContext> {
  const memberships = await prisma.lpMembership.findMany({
    where: { userId },
    select: {
      lp: {
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
        },
      },
    },
    orderBy: {
      lp: {
        name: "asc",
      },
    },
  });

  const scopedOptions = memberships
    .map((membership) => membership.lp)
    .filter((lp) => lp.isActive)
    .map((lp) => ({
      lpId: lp.id,
      lpName: lp.name,
      lpCode: lp.code,
    }));

  if (scopedOptions.length > 0) {
    return buildLpContext(scopedOptions, false);
  }

  if (systemRole === "ADMIN") {
    const fallbackLps = await prisma.lP.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: {
        name: "asc",
      },
      take: 25,
    });

    if (fallbackLps.length > 0) {
      return buildLpContext(
        fallbackLps.map((lp) => ({
          lpId: lp.id,
          lpName: lp.name,
          lpCode: lp.code,
        })),
        true,
      );
    }
  }

  return {
    options: [],
    lpIds: [],
    primaryLpName: null,
    displayName: "LP workspace",
    totalLps: 0,
    isFallbackContext: false,
  };
}
