import {
  DashboardShell,
  type DashboardShellUser,
} from "@/components/dashboard-shell";
import { getAccessSnapshot } from "@/lib/authz";

function getShellUser(
  access: Awaited<ReturnType<typeof getAccessSnapshot>>,
): DashboardShellUser {
  return {
    name: access.user.name,
    email: access.user.email,
    systemRole: access.user.systemRole,
    defaultHomeHref: access.defaultHomeHref,
    hasAdminAccess: access.hasAdminAccess,
    hasLpAccess: access.hasLpAccess,
    hasStoreAccess: access.hasStoreAccess,
    hasOperationsAccess: access.hasOperationsAccess,
  };
}

export default async function WithSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAccessSnapshot();

  return (
    <DashboardShell user={getShellUser(access)}>
      {children}
    </DashboardShell>
  );
}
