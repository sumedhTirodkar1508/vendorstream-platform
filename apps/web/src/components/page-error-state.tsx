import type { ReactNode } from "react";
import { AlertTriangle, Ban, SearchX } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type PageErrorVariant = "missing" | "forbidden" | "error";

const VARIANT_STYLES: Record<
  PageErrorVariant,
  {
    badgeLabel: string;
    cardClassName: string;
    badgeClassName: string;
    descriptionClassName: string;
    icon: ReactNode;
  }
> = {
  missing: {
    badgeLabel: "Not found",
    cardClassName: "border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl",
    badgeClassName:
      "border border-amber-400/30 bg-amber-500/10 text-amber-100",
    descriptionClassName: "text-amber-100/90",
    icon: <SearchX className="h-5 w-5" />,
  },
  forbidden: {
    badgeLabel: "Access restricted",
    cardClassName: "border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl",
    badgeClassName:
      "border border-red-400/30 bg-red-500/10 text-red-100",
    descriptionClassName: "text-red-100/90",
    icon: <Ban className="h-5 w-5" />,
  },
  error: {
    badgeLabel: "Unavailable",
    cardClassName: "border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl",
    badgeClassName:
      "border border-red-400/30 bg-red-500/10 text-red-100",
    descriptionClassName: "text-red-100/90",
    icon: <AlertTriangle className="h-5 w-5" />,
  },
};

export function PageErrorState({
  variant,
  title,
  description,
  badgeLabel,
  actions,
}: {
  variant: PageErrorVariant;
  title: string;
  description: ReactNode;
  badgeLabel?: string;
  actions?: ReactNode;
}) {
  const styles = VARIANT_STYLES[variant];

  return (
    <Card className={styles.cardClassName}>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className={cn("inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.18em]", styles.badgeClassName)}>
            {badgeLabel ?? styles.badgeLabel}
          </div>
          <div className={cn("inline-flex h-9 w-9 items-center justify-center rounded-full", styles.badgeClassName)}>
            {styles.icon}
          </div>
        </div>
        <CardTitle className="text-2xl text-white">{title}</CardTitle>
        <CardDescription
          className={cn("text-sm leading-6", styles.descriptionClassName)}
        >
          {description}
        </CardDescription>
      </CardHeader>
      {actions ? (
        <CardContent className="flex flex-wrap gap-3">{actions}</CardContent>
      ) : null}
    </Card>
  );
}
