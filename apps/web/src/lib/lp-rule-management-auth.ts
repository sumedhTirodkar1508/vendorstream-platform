import "server-only";

import {
  prisma,
  type LpMembershipRole,
  type SystemRole,
} from "@vendorstream/database";

export const MANAGEABLE_LP_RULE_ROLES: LpMembershipRole[] = [
  "LP_ADMIN",
  "LP_MANAGER",
];

export type LpRuleManagementActor = {
  userId: string;
  systemRole?: SystemRole | string | null;
};

export async function canManageLpRules(args: {
  actor: LpRuleManagementActor;
  lpId: string;
}) {
  const lpId = args.lpId.trim();

  if (!args.actor.userId || !lpId) {
    return false;
  }

  if (args.actor.systemRole === "ADMIN") {
    const lp = await prisma.lP.findUnique({
      where: {
        id: lpId,
      },
      select: {
        id: true,
      },
    });

    return Boolean(lp);
  }

  const membership = await prisma.lpMembership.findFirst({
    where: {
      userId: args.actor.userId,
      lpId,
      role: {
        in: MANAGEABLE_LP_RULE_ROLES,
      },
    },
    select: {
      id: true,
    },
  });

  return Boolean(membership);
}
