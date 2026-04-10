import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  DashboardShell,
  type DashboardShellUser,
} from "@/components/dashboard-shell";

function getShellUser(sessionUser: any): DashboardShellUser {
  return {
    name: sessionUser?.name?.trim() || "VendorStream User",
    email: sessionUser?.email?.trim() || "unknown@vendorstream.local",
    systemRole: sessionUser?.systemRole,
  };
}

export default async function WithSidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell user={getShellUser(session.user)}>
      {children}
    </DashboardShell>
  );
}
