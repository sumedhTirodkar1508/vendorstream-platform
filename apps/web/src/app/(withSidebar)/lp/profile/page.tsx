import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ProfilePageState =
  | {
      kind: "ready";
      user: {
        name: string;
        email: string;
        isEmailVerified: boolean;
        systemRole: "USER" | "ADMIN" | "FINANCE_VIEWER";
      };
      currentLpContext: {
        name: string;
        code: string;
        membershipRole: "LP_ADMIN" | "LP_MANAGER" | "LP_VIEWER";
        storeCoverage: number;
        cycleMonthLabel: string;
      };
      memberships: Array<{
        id: string;
        lpName: string;
        lpCode: string;
        membershipRole: "LP_ADMIN" | "LP_MANAGER" | "LP_VIEWER";
        status: "Active" | "Pending";
        isCurrent: boolean;
      }>;
    }
  | {
      kind: "empty";
      user: {
        name: string;
        email: string;
        isEmailVerified: boolean;
        systemRole: "USER" | "ADMIN" | "FINANCE_VIEWER";
      };
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "loading";
    };

async function getLpProfilePageState(): Promise<ProfilePageState> {
  const mockMode = process.env.MOCK_LP_PROFILE_STATE;

  if (mockMode === "loading") {
    return { kind: "loading" };
  }

  if (mockMode === "error") {
    return {
      kind: "error",
      message:
        "We could not load LP profile details right now. Try again or contact your VendorStream administrator.",
    };
  }

  if (mockMode === "empty") {
    return {
      kind: "empty",
      user: {
        name: "Avery Chen",
        email: "avery.chen@northstarbeverage.com",
        isEmailVerified: true,
        systemRole: "USER",
      },
    };
  }

  return {
    kind: "ready",
    user: {
      name: "Avery Chen",
      email: "avery.chen@northstarbeverage.com",
      isEmailVerified: true,
      systemRole: "USER",
    },
    currentLpContext: {
      name: "Northstar Beverage Group",
      code: "LP-204",
      membershipRole: "LP_ADMIN",
      storeCoverage: 14,
      cycleMonthLabel: "April 2026",
    },
    memberships: [
      {
        id: "northstar",
        lpName: "Northstar Beverage Group",
        lpCode: "LP-204",
        membershipRole: "LP_ADMIN",
        status: "Active",
        isCurrent: true,
      },
      {
        id: "harbor",
        lpName: "Harbor Ridge Wines",
        lpCode: "LP-118",
        membershipRole: "LP_VIEWER",
        status: "Active",
        isCurrent: false,
      },
    ],
  };
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "neutral" | "warning";
}) {
  const styles =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
        : "border-white/10 bg-white/5 text-slate-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}
    >
      {label}
    </span>
  );
}

function DetailRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`text-sm font-medium text-white ${valueClassName || ""}`}>
        {value}
      </div>
    </div>
  );
}

function PlaceholderCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base text-white">{title}</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
          Placeholder ready for future settings integration.
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        {[0, 1].map((item) => (
          <Card
            key={item}
            className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl"
          >
            <CardHeader className="space-y-3">
              <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
              <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="h-12 animate-pulse rounded-xl bg-white/8" />
              <div className="h-12 animate-pulse rounded-xl bg-white/8" />
              <div className="h-12 animate-pulse rounded-xl bg-white/8" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-3">
          <div className="h-4 w-36 animate-pulse rounded bg-white/10" />
          <div className="h-6 w-56 animate-pulse rounded bg-white/10" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-16 animate-pulse rounded-xl bg-white/8"
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border border-red-400/20 bg-red-500/8 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-3">
        <div className="inline-flex w-fit items-center rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-red-100">
          Profile unavailable
        </div>
        <CardTitle className="text-2xl text-white">
          LP profile data could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button
          asChild
          className="bg-white text-slate-950 hover:bg-slate-100"
        >
          <Link href="/dashboard">Return to dashboard</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          <Link href="/login">Re-authenticate</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  user,
}: {
  user: {
    name: string;
    email: string;
    isEmailVerified: boolean;
    systemRole: "USER" | "ADMIN" | "FINANCE_VIEWER";
  };
}) {
  return (
    <div className="space-y-6">
      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
            VendorStream
          </div>
          <CardTitle className="text-3xl text-white">
            Profile and LP access
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Your account is active, but no licensed producer memberships are
            assigned yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <DetailRow label="Name" value={user.name} />
          <DetailRow label="Email" value={user.email} />
          <DetailRow
            label="Email status"
            value={
              <StatusPill
                label={user.isEmailVerified ? "Verified" : "Pending verification"}
                tone={user.isEmailVerified ? "success" : "warning"}
              />
            }
          />
          <DetailRow label="System role" value={user.systemRole} />
        </CardContent>
      </Card>

      <Card className="border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">
            No LP memberships found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-amber-100/90">
            Ask a VendorStream administrator to assign your LP membership before
            monthly upload, mismatch review, and statement workflows can begin.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            asChild
            className="bg-white text-slate-950 hover:bg-slate-100"
          >
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link href="mailto:support@vendorstream.ca">
              Contact administrator
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReadyState({
  state,
}: {
  state: Extract<ProfilePageState, { kind: "ready" }>;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
              VendorStream
            </div>
            <CardTitle className="text-3xl text-white">
              Profile and LP settings
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Review your account identity, current licensed producer context,
              and membership coverage before reconciling monthly statements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Name" value={state.user.name} />
            <DetailRow label="Email" value={state.user.email} />
            <DetailRow
              label="Email status"
              value={
                <StatusPill
                  label={
                    state.user.isEmailVerified
                      ? "Verified"
                      : "Pending verification"
                  }
                  tone={state.user.isEmailVerified ? "success" : "warning"}
                />
              }
            />
            <DetailRow label="System role" value={state.user.systemRole} />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <CardTitle className="text-xl text-white">
              Current LP context
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Active membership context used for monthly uploads and review
              workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-cyan-100/85">
                Current LP
              </div>
              <div className="mt-2 text-xl font-semibold text-white">
                {state.currentLpContext.name}
              </div>
              <div className="mt-1 text-sm text-slate-300">
                {state.currentLpContext.code}
              </div>
            </div>
            <DetailRow
              label="Membership role"
              value={state.currentLpContext.membershipRole}
            />
            <DetailRow
              label="Store coverage"
              value={`${state.currentLpContext.storeCoverage} active store locations`}
            />
            <DetailRow
              label="Current cycle"
              value={state.currentLpContext.cycleMonthLabel}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">
            LP memberships
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Memberships available to this user across licensed producer
            contexts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.memberships.map((membership) => (
            <div
              key={membership.id}
              className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="space-y-1">
                <div className="text-base font-medium text-white">
                  {membership.lpName}
                </div>
                <div className="text-sm text-slate-400">
                  {membership.lpCode} · {membership.membershipRole}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill
                  label={membership.status}
                  tone={membership.status === "Active" ? "success" : "warning"}
                />
                {membership.isCurrent ? (
                  <StatusPill label="Current context" tone="neutral" />
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <PlaceholderCard
          title="Change password"
          description="Credential updates will live here once the authenticated settings workflow is connected."
        />
        <PlaceholderCard
          title="Notification preferences"
          description="Email and workflow notification controls for uploads, mismatches, and statement readiness."
        />
        <PlaceholderCard
          title="Profile image / avatar"
          description="Avatar management placeholder for future account personalization."
        />
      </div>
    </div>
  );
}

export default async function LpProfilePage() {
  const state = await getLpProfilePageState();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06111f] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(27,55,95,0.55),transparent_42%)]" />
        <div className="absolute left-[-10%] top-[18%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/12 blur-3xl" />
        <div className="absolute right-[-8%] top-[12%] h-[28rem] w-[28rem] rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,17,31,0.72)_0%,rgba(6,17,31,0.96)_100%)]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            LP Profile
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Account settings and LP context
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Manage your account identity and review which licensed producer
              context this profile can access inside VendorStream.
            </p>
          </div>
        </header>

        {state.kind === "loading" ? <LoadingState /> : null}
        {state.kind === "error" ? <ErrorState message={state.message} /> : null}
        {state.kind === "empty" ? <EmptyState user={state.user} /> : null}
        {state.kind === "ready" ? <ReadyState state={state} /> : null}
      </div>
    </main>
  );
}
