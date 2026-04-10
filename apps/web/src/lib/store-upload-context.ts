import { prisma } from "@vendorstream/database";

type AppSystemRole = "USER" | "ADMIN" | "FINANCE_VIEWER" | undefined;

export type StoreUploadAssignmentOption = {
  assignmentId: string;
  lpId: string;
  lpName: string;
  lpCode: string | null;
  storeOrganizationId: string;
  storeOrganizationName: string;
  storeLocationId: string;
  storeLocationName: string;
  storeLocationCode: string | null;
};

export type StoreUploadContext = {
  options: StoreUploadAssignmentOption[];
  primaryStoreOrganizationName: string | null;
  totalStoreOrganizations: number;
  totalLocations: number;
  isFallbackContext: boolean;
};

function buildContextFromOrganizations(
  organizations: Array<{
    id: string;
    name: string;
    locations: Array<{
      id: string;
      name: string;
      code: string | null;
      lpAssignments: Array<{
        id: string;
        lpId: string;
        lp: {
          id: string;
          name: string;
          code: string | null;
        };
      }>;
    }>;
  }>,
  isFallbackContext: boolean,
): StoreUploadContext {
  const options = organizations
    .flatMap((organization) =>
      organization.locations.flatMap((location) =>
        location.lpAssignments.map((assignment) => ({
          assignmentId: assignment.id,
          lpId: assignment.lpId,
          lpName: assignment.lp.name,
          lpCode: assignment.lp.code,
          storeOrganizationId: organization.id,
          storeOrganizationName: organization.name,
          storeLocationId: location.id,
          storeLocationName: location.name,
          storeLocationCode: location.code,
        })),
      ),
    )
    .sort((a, b) => {
      if (a.storeOrganizationName !== b.storeOrganizationName) {
        return a.storeOrganizationName.localeCompare(b.storeOrganizationName);
      }

      if (a.storeLocationName !== b.storeLocationName) {
        return a.storeLocationName.localeCompare(b.storeLocationName);
      }

      return a.lpName.localeCompare(b.lpName);
    });

  const totalLocations = new Set(
    organizations.flatMap((organization) =>
      organization.locations.map((location) => location.id),
    ),
  ).size;

  return {
    options,
    primaryStoreOrganizationName: organizations[0]?.name ?? null,
    totalStoreOrganizations: organizations.length,
    totalLocations,
    isFallbackContext,
  };
}

export async function getStoreUploadContextForUser({
  userId,
  systemRole,
}: {
  userId: string;
  systemRole?: AppSystemRole;
}): Promise<StoreUploadContext> {
  const memberships = await prisma.storeOrgMembership.findMany({
    where: { userId },
    select: {
      storeOrganization: {
        select: {
          id: true,
          name: true,
          locations: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              code: true,
              lpAssignments: {
                where: {
                  isActive: true,
                  lp: {
                    isActive: true,
                  },
                },
                select: {
                  id: true,
                  lpId: true,
                  lp: {
                    select: {
                      id: true,
                      name: true,
                      code: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const scopedOrganizations = memberships
    .map((membership) => membership.storeOrganization)
    .filter((organization) =>
      organization.locations.some((location) => location.lpAssignments.length > 0),
    );

  if (scopedOrganizations.length > 0) {
    return buildContextFromOrganizations(scopedOrganizations, false);
  }

  if (systemRole === "ADMIN") {
    const fallbackStoreOrganization = await prisma.storeOrganization.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        locations: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            code: true,
            lpAssignments: {
              where: {
                isActive: true,
                lp: {
                  isActive: true,
                },
              },
              select: {
                id: true,
                lpId: true,
                lp: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    if (fallbackStoreOrganization) {
      return buildContextFromOrganizations([fallbackStoreOrganization], true);
    }
  }

  return {
    options: [],
    primaryStoreOrganizationName: null,
    totalStoreOrganizations: 0,
    totalLocations: 0,
    isFallbackContext: false,
  };
}
