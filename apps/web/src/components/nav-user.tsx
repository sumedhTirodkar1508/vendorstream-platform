"use client";

import { useMemo, useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

type NavUserProps = {
  user: {
    name: string;
    email: string;
    systemRole?: "USER" | "ADMIN" | "FINANCE_VIEWER";
  };
  compact?: boolean;
};

function getRoleLabel(role?: "USER" | "ADMIN" | "FINANCE_VIEWER") {
  if (role === "ADMIN") {
    return "Platform Admin";
  }

  if (role === "FINANCE_VIEWER") {
    return "Finance Viewer";
  }

  return "Operations User";
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "VS";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function NavUser({ user, compact = false }: NavUserProps) {
  const [isPending, startTransition] = useTransition();

  const roleLabel = useMemo(() => getRoleLabel(user.systemRole), [user.systemRole]);
  const initials = useMemo(() => getInitials(user.name), [user.name]);

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/6 shadow-[0_20px_60px_-28px_rgba(0,0,0,0.6)] backdrop-blur-xl ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(103,232,249,0.18),rgba(226,232,240,0.08))] text-sm font-semibold text-white ring-1 ring-white/10">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">
            {user.name}
          </div>
          <div className="truncate text-xs text-slate-400">{user.email}</div>
          <div className="mt-2 inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-medium tracking-[0.14em] text-cyan-100 uppercase">
            {roleLabel}
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(() => {
            void signOut({ callbackUrl: "/login" });
          });
        }}
        className="mt-4 w-full justify-start text-slate-300 hover:bg-white/5 hover:text-white"
      >
        <LogOut className="size-4" />
        {isPending ? "Signing out..." : "Sign out"}
      </Button>
    </div>
  );
}
