import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function EmptyState({
  title,
  description,
  icon,
  actions,
  children,
  className,
}: {
  title: string;
  description: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl",
        className,
      )}
    >
      <CardHeader className="space-y-4">
        {icon ? (
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-100">
            {icon}
          </div>
        ) : null}
        <div className="space-y-2">
          <CardTitle className="text-2xl text-white">{title}</CardTitle>
          <CardDescription className="max-w-3xl text-sm leading-6 text-slate-300">
            {description}
          </CardDescription>
        </div>
      </CardHeader>
      {children || actions ? (
        <CardContent className="space-y-4">
          {children}
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
