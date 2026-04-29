import "server-only";

import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  getLpAccessContextForUser,
  type LpAccessContext,
} from "@/lib/lp-access-context";
import {
  getStoreUploadContextForUser,
  type StoreUploadContext,
} from "@/lib/store-upload-context";

export type AppSystemRole = "USER" | "ADMIN" | "FINANCE_VIEWER";

export type AuthenticatedAppUser = {
  id: string;
  email: string;
  name: string;
  systemRole: AppSystemRole;
  isEmailVerified: boolean;
};

export type AccessSnapshot = {
  user: AuthenticatedAppUser;
  lpContext: LpAccessContext;
  storeContext: StoreUploadContext;
  hasAdminAccess: boolean;
  hasLpAccess: boolean;
  hasStoreAccess: boolean;
  hasOperationsAccess: boolean;
  defaultHomeHref: string;
};

export function isAdminRole(role?: string): role is "ADMIN" {
  return role === "ADMIN";
}

export function isOperationsRole(
  role?: string,
): role is "ADMIN" | "FINANCE_VIEWER" {
  return role === "ADMIN" || role === "FINANCE_VIEWER";
}

export function canAccessAdminSection(access: AccessSnapshot) {
  return access.hasAdminAccess;
}

export function canAccessLpSection(access: AccessSnapshot) {
  return access.hasAdminAccess || access.hasLpAccess;
}

export function canAccessStoreSection(access: AccessSnapshot) {
  return access.hasAdminAccess || access.hasStoreAccess;
}

function normalizeSystemRole(value?: string): AppSystemRole {
  if (value === "ADMIN" || value === "FINANCE_VIEWER") {
    return value;
  }

  return "USER";
}

function getDefaultHomeHref(args: {
  hasAdminAccess: boolean;
  hasLpAccess: boolean;
  hasStoreAccess: boolean;
  hasOperationsAccess: boolean;
}) {
  if (args.hasAdminAccess) {
    return "/admin/dashboard";
  }

  if (args.hasLpAccess) {
    return "/dashboard";
  }

  if (args.hasStoreAccess) {
    return "/store/dashboard";
  }

  if (args.hasOperationsAccess) {
    return "/audit";
  }

  return "/dashboard";
}

export const requireAuthenticatedUser = cache(
  async (): Promise<AuthenticatedAppUser> => {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      redirect("/login");
    }

    if (!session.user.id) {
      redirect("/login");
    }

    return {
      id: session.user.id,
      email: session.user.email?.trim() || "unknown@vendorstream.local",
      name: session.user.name?.trim() || "VendorStream User",
      systemRole: normalizeSystemRole(session.user.systemRole),
      isEmailVerified: Boolean(session.user.isEmailVerified),
    };
  },
);

export const getAccessSnapshot = cache(async (): Promise<AccessSnapshot> => {
  const user = await requireAuthenticatedUser();
  const [lpContext, storeContext] = await Promise.all([
    getLpAccessContextForUser({
      userId: user.id,
      systemRole: user.systemRole,
    }),
    getStoreUploadContextForUser({
      userId: user.id,
      systemRole: user.systemRole,
    }),
  ]);

  const hasAdminAccess = isAdminRole(user.systemRole);
  const hasLpAccess = lpContext.lpIds.length > 0;
  const hasStoreAccess = storeContext.options.length > 0;
  const hasOperationsAccess = isOperationsRole(user.systemRole);

  return {
    user,
    lpContext,
    storeContext,
    hasAdminAccess,
    hasLpAccess,
    hasStoreAccess,
    hasOperationsAccess,
    defaultHomeHref: getDefaultHomeHref({
      hasAdminAccess,
      hasLpAccess,
      hasStoreAccess,
      hasOperationsAccess,
    }),
  };
});
