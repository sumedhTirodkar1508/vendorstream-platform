import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageErrorState } from "@/components/page-error-state";

export function ForbiddenSectionState({
  title,
  description,
  homeHref,
}: {
  title: string;
  description: string;
  homeHref: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 sm:px-8 lg:px-10">
      <PageErrorState
        variant="forbidden"
        title={title}
        description={description}
        actions={
          <>
            <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
              <Link href={homeHref}>Open allowed workspace</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href="/dashboard">Go to shared dashboard</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
