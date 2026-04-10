import Link from "next/link";
import {
  ArrowUpFromLine,
  ClipboardList,
  FileBarChart2,
  FolderClock,
  LayoutDashboard,
  Settings2,
  ShieldAlert,
  UserCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavUser } from "@/components/nav-user";

type AppSidebarProps = {
  pathname: string;
  user: {
    name: string;
    email: string;
    systemRole?: "USER" | "ADMIN" | "FINANCE_VIEWER";
  };
  onNavigate?: () => void;
};

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

// TODO: Split these sections by LP user, store org user, and admin role once
// org-context role resolution is available in session or server data.
const navSections: NavSection[] = [
  {
    title: "Dashboard",
    items: [
      {
        title: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        isActive: (pathname) => pathname === "/dashboard",
      },
    ],
  },
  {
    title: "Uploads",
    items: [
      {
        title: "New Upload",
        href: "/lp/uploads/new",
        icon: ArrowUpFromLine,
        isActive: (pathname) => pathname === "/lp/uploads/new",
      },
      {
        title: "Import History",
        href: "/lp/uploads",
        icon: FolderClock,
        isActive: (pathname) => pathname === "/lp/uploads",
      },
    ],
  },
  {
    title: "Reconciliation",
    items: [
      {
        title: "Cycles",
        href: "/lp/cycles",
        icon: ClipboardList,
        isActive: (pathname) =>
          (pathname === "/lp/cycles" || pathname.startsWith("/lp/cycles/")) &&
          !pathname.includes("/mismatches"),
      },
      {
        title: "Mismatches",
        href: "/lp/cycles?status=MISMATCHES_FOUND",
        icon: ShieldAlert,
        isActive: (pathname) => pathname.includes("/mismatches"),
      },
    ],
  },
  {
    title: "Statements",
    items: [
      {
        title: "Statement Versions",
        href: "/lp/statements",
        icon: FileBarChart2,
        isActive: (pathname) =>
          pathname === "/lp/statements" || pathname.startsWith("/lp/statements/"),
      },
    ],
  },
  {
    title: "Profile",
    items: [
      {
        title: "Profile / Settings",
        href: "/lp/profile",
        icon: UserCircle2,
        isActive: (pathname) => pathname === "/lp/profile",
      },
    ],
  },
];

export function AppSidebar({ pathname, user, onNavigate }: AppSidebarProps) {
  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(10,18,31,0.96)_0%,rgba(8,13,23,0.98)_100%)] text-white">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[rgba(10,18,31,0.94)] px-4 py-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-medium tracking-[0.22em] text-slate-400 uppercase">
            Workspace
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300">
            <Settings2 className="size-3.5" />
            LP
          </div>
        </div>
        <NavUser user={user} compact />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <nav className="space-y-6">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="px-3 text-[11px] font-medium tracking-[0.22em] text-slate-500 uppercase">
                {section.title}
              </div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = item.isActive(pathname);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.title}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors",
                        active
                          ? "bg-cyan-400/12 text-white ring-1 ring-cyan-400/20"
                          : "text-slate-300 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 items-center justify-center rounded-xl border transition-colors",
                          active
                            ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                            : "border-white/8 bg-white/5 text-slate-400 group-hover:border-white/12 group-hover:text-slate-100",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
