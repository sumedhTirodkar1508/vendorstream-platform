import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

type AppHeaderProps = {
  onOpenSidebar: () => void;
};

export function AppHeader({ onOpenSidebar }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[rgba(6,17,31,0.86)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onOpenSidebar}
          className="text-slate-200 hover:bg-white/5 hover:text-white lg:hidden"
        >
          <Menu className="size-4" />
          <span className="sr-only">Open sidebar</span>
        </Button>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-3 rounded-xl px-1 py-1 text-left"
        >
          <div className="flex size-9 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-xs font-semibold tracking-[0.18em] text-cyan-100 uppercase">
            VS
          </div>
          <div className="leading-none">
            <div className="text-sm font-semibold tracking-[0.14em] text-white uppercase">
              VendorStream
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Reconciliation Operations
            </div>
          </div>
        </Link>
      </div>

      <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium tracking-[0.14em] text-slate-300 uppercase sm:inline-flex">
        Internal Workspace
      </div>
    </header>
  );
}
