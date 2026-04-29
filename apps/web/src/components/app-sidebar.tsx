import Link from "next/link";
import {
  ArrowUpFromLine,
  Bell,
  Building2,
  ClipboardList,
  FileBarChart2,
  FolderClock,
  LayoutDashboard,
  MapPinned,
  Settings2,
  ShieldAlert,
  UserCircle2,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavUser } from "@/components/nav-user";

type AppSidebarProps = {
  pathname: string;
  user: {
    name: string;
    email: string;
    systemRole?: "USER" | "ADMIN" | "FINANCE_VIEWER";
    defaultHomeHref: string;
    hasAdminAccess: boolean;
    hasLpAccess: boolean;
    hasStoreAccess: boolean;
    hasOperationsAccess: boolean;
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

function getWorkspaceLabel(pathname: string) {
  if (pathname.startsWith("/admin")) {
    return "Admin";
  }

  if (pathname.startsWith("/store")) {
    return "Store";
  }

  if (pathname.startsWith("/lp")) {
    return "LP";
  }

  if (pathname === "/audit") {
    return "Operations";
  }

  if (pathname === "/notifications") {
    return "Shared";
  }

  return "Workspace";
}

function buildNavSections(user: AppSidebarProps["user"]): NavSection[] {
  const sections: NavSection[] = [
    {
      title: "Workspace",
      items: [
        {
          title: "Home",
          href: user.defaultHomeHref,
          icon: LayoutDashboard,
          isActive: (pathname) => pathname === user.defaultHomeHref,
        },
      ],
    },
  ];

  if (user.hasAdminAccess) {
    sections.push({
      title: "Admin",
      items: [
        {
          title: "Dashboard",
          href: "/admin/dashboard",
          icon: LayoutDashboard,
          isActive: (pathname) => pathname === "/admin/dashboard",
        },
        {
          title: "Users",
          href: "/admin/users",
          icon: Users2,
          isActive: (pathname) => pathname === "/admin/users",
        },
        {
          title: "LPs",
          href: "/admin/lps",
          icon: Building2,
          isActive: (pathname) => pathname === "/admin/lps",
        },
        {
          title: "Store Orgs",
          href: "/admin/store-organizations",
          icon: Building2,
          isActive: (pathname) => pathname === "/admin/store-organizations",
        },
        {
          title: "Store Locations",
          href: "/admin/store-locations",
          icon: MapPinned,
          isActive: (pathname) => pathname === "/admin/store-locations",
        },
        {
          title: "Assignments",
          href: "/admin/assignments",
          icon: ClipboardList,
          isActive: (pathname) => pathname === "/admin/assignments",
        },
        {
          title: "Statement Tasks",
          href: "/admin/statements/tasks",
          icon: FileBarChart2,
          isActive: (pathname) => pathname === "/admin/statements/tasks",
        },
      ],
    });
  }

  if (user.hasLpAccess || user.hasAdminAccess) {
    sections.push({
      title: "LP",
      items: [
        {
          title: "Dashboard",
          href: "/dashboard",
          icon: LayoutDashboard,
          isActive: (pathname) => pathname === "/dashboard",
        },
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
          isActive: (pathname) => pathname.includes("/lp/cycles/") && pathname.includes("/mismatches"),
        },
        {
          title: "Statements",
          href: "/lp/statements",
          icon: FileBarChart2,
          isActive: (pathname) =>
            pathname === "/lp/statements" || pathname.startsWith("/lp/statements/"),
        },
        {
          title: "Category Rules",
          href: "/lp/rules/categories",
          icon: Settings2,
          isActive: (pathname) => pathname === "/lp/rules/categories",
        },
        {
          title: "Product Rules",
          href: "/lp/rules/products",
          icon: Settings2,
          isActive: (pathname) => pathname === "/lp/rules/products",
        },
        {
          title: "Profile",
          href: "/lp/profile",
          icon: UserCircle2,
          isActive: (pathname) => pathname === "/lp/profile",
        },
      ],
    });
  }

  if (user.hasStoreAccess || user.hasAdminAccess) {
    sections.push({
      title: "Store",
      items: [
        {
          title: "Dashboard",
          href: "/store/dashboard",
          icon: LayoutDashboard,
          isActive: (pathname) => pathname === "/store/dashboard",
        },
        {
          title: "New Upload",
          href: "/store/uploads/new",
          icon: ArrowUpFromLine,
          isActive: (pathname) => pathname === "/store/uploads/new",
        },
        {
          title: "Upload History",
          href: "/store/uploads",
          icon: FolderClock,
          isActive: (pathname) => pathname === "/store/uploads",
        },
        {
          title: "Cycles",
          href: "/store/cycles",
          icon: ClipboardList,
          isActive: (pathname) =>
            (pathname === "/store/cycles" || pathname.startsWith("/store/cycles/")) &&
            !pathname.includes("/mismatches"),
        },
        {
          title: "Statements",
          href: "/store/statements",
          icon: FileBarChart2,
          isActive: (pathname) =>
            pathname === "/store/statements" || pathname.startsWith("/store/statements/"),
        },
        {
          title: "Profile",
          href: "/store/profile",
          icon: UserCircle2,
          isActive: (pathname) => pathname === "/store/profile",
        },
      ],
    });
  }

  if (user.hasOperationsAccess) {
    sections.push({
      title: "Operations",
      items: [
        {
          title: "Audit",
          href: "/audit",
          icon: ShieldAlert,
          isActive: (pathname) => pathname === "/audit",
        },
      ],
    });
  }

  sections.push({
    title: "Shared",
    items: [
      {
        title: "Notifications",
        href: "/notifications",
        icon: Bell,
        isActive: (pathname) => pathname === "/notifications",
      },
    ],
  });

  return sections;
}

export function AppSidebar({ pathname, user, onNavigate }: AppSidebarProps) {
  const navSections = buildNavSections(user);
  const workspaceLabel = getWorkspaceLabel(pathname);

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(10,18,31,0.96)_0%,rgba(8,13,23,0.98)_100%)] text-white">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[rgba(10,18,31,0.94)] px-4 py-4 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-medium tracking-[0.22em] text-slate-400 uppercase">
            Workspace
          </div>
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-300">
            <Settings2 className="size-3.5" />
            {workspaceLabel}
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
