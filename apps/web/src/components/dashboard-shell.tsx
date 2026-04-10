"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";

export type DashboardShellUser = {
  name: string;
  email: string;
  systemRole?: "USER" | "ADMIN" | "FINANCE_VIEWER";
};

type DashboardShellProps = {
  user: DashboardShellUser;
  children: React.ReactNode;
};

export function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="dark min-h-screen bg-[#06111f] text-white">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(27,55,95,0.32),transparent_42%)]" />
        <div className="absolute left-[-8%] top-[12%] h-[22rem] w-[22rem] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-10%] top-[16%] h-[26rem] w-[26rem] rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,17,31,0.88)_0%,rgba(6,17,31,1)_100%)]" />
      </div>

      <div className="relative flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-[18rem] shrink-0 border-r border-white/10 lg:block">
          <AppSidebar pathname={pathname} user={user} />
        </aside>

        {isMobileSidebarOpen ? (
          <div className="lg:hidden">
            <button
              type="button"
              className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm"
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="Close sidebar overlay"
            />
            <aside className="fixed inset-y-0 left-0 z-50 w-[18rem] border-r border-white/10 shadow-2xl">
              <AppSidebar
                pathname={pathname}
                user={user}
                onNavigate={() => setIsMobileSidebarOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader onOpenSidebar={() => setIsMobileSidebarOpen(true)} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
