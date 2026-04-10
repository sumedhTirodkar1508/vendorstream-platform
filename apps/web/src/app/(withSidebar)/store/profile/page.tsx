import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type StoreOrgMembershipRole } from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type StoreProfileUser = {
  name: string;
  email: string;
  isEmailVerified: boolean;
  systemRole: "USER" | "ADMIN" | "FINANCE_VIEWER" | "UNKNOWN";
};

type MembershipRow = {
  id: string;
  storeOrganizationId: string;
  storeOrganizationName: string;
  storeOrganizationCode: string | null;
  membershipRole: StoreOrgMembershipRole;
  locationCount: number;
};

type LocationRow = {
  id: string;
  storeOrganizationId: string;
  storeOrganizationName: string;
  name: string;
  code: string | null;
  city: string;
  province: string;
  lpAssignmentCount: number;
};

type StoreProfilePageState =
  | {
      kind: "ready";
      user: StoreProfileUser;
      memberships: MembershipRow[];
      locations: LocationRow[];
      summary: {
        membershipCount: number;
        locationCount: number;
      };
    }
  | {
      kind: "empty";
      user: StoreProfileUser;
    }
  | {
      kind: "error";
      message: string;
    };

function formatSystemRole(value: StoreProfileUser["systemRole"]) {
  return value.replaceAll("_", " ");
}

function formatMembershipRole(value: StoreOrgMembershipRole) {
  return value.replaceAll("_", " ");
}

function getInitials(name: string) {
  const parts = name
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "VS";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
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
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "success";
}) {
  const accentClass =
    tone === "success"
      ? "from-emerald-400/20 to-transparent"
      : "from-cyan-400/20 to-transparent";

  return (
    <Card className="relative border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b ${accentClass}`}
      />
      <CardHeader className="relative space-y-2">
        <CardDescription className="text-xs uppercase tracking-[0.18em] text-slate-300">
          {label}
        </CardDescription>
        <CardTitle className="text-4xl font-semibold tracking-tight text-white">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <p className="text-sm leading-6 text-slate-300">{detail}</p>
      </CardContent>
    </Card>
  );
}

function PlaceholderCard({
  title,
  description,
  actionLabel,
}: {
  title: string;
  description: string;
  actionLabel: string;
}) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base text-white">{title}</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
          Placeholder ready for future settings integration.
        </div>
        <Button
          type="button"
          variant="outline"
          disabled
          className="border-white/15 bg-white/5 text-white disabled:text-slate-500"
        >
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

async function getStoreProfilePageState(): Promise<StoreProfilePageState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (!session.user.id) {
    redirect("/login");
  }

  const user: StoreProfileUser = {
    name: session.user.name?.trim() || "VendorStream User",
    email: session.user.email?.trim() || "Not available",
    isEmailVerified: Boolean(session.user.isEmailVerified),
    systemRole: session.user.systemRole ?? "UNKNOWN",
  };

  try {
    const memberships = await prisma.storeOrgMembership.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        role: true,
        storeOrganization: {
          select: {
            id: true,
            name: true,
            code: true,
            locations: {
              where: {
                isActive: true,
              },
              select: {
                id: true,
                name: true,
                code: true,
                city: true,
                province: true,
                lpAssignments: {
                  where: {
                    isActive: true,
                  },
                  select: {
                    id: true,
                  },
                },
              },
              orderBy: [{ name: "asc" }],
            },
          },
        },
      },
    });

    if (memberships.length === 0) {
      return {
        kind: "empty",
        user,
      };
    }

    const membershipRows: MembershipRow[] = memberships.map((membership) => ({
      id: membership.id,
      storeOrganizationId: membership.storeOrganization.id,
      storeOrganizationName: membership.storeOrganization.name,
      storeOrganizationCode: membership.storeOrganization.code,
      membershipRole: membership.role,
      locationCount: membership.storeOrganization.locations.length,
    }));

    const locations = Array.from(
      new Map(
        memberships.flatMap((membership) =>
          membership.storeOrganization.locations.map((location) => [
            location.id,
            {
              id: location.id,
              storeOrganizationId: membership.storeOrganization.id,
              storeOrganizationName: membership.storeOrganization.name,
              name: location.name,
              code: location.code,
              city: location.city,
              province: location.province,
              lpAssignmentCount: location.lpAssignments.length,
            } satisfies LocationRow,
          ]),
        ),
      ).values(),
    ).sort((a, b) => {
      if (a.storeOrganizationName !== b.storeOrganizationName) {
        return a.storeOrganizationName.localeCompare(b.storeOrganizationName);
      }

      return a.name.localeCompare(b.name);
    });

    return {
      kind: "ready",
      user,
      memberships: membershipRows,
      locations,
      summary: {
        membershipCount: membershipRows.length,
        locationCount: locations.length,
      },
    };
  } catch (error) {
    console.error("Failed to load store profile page", error);

    return {
      kind: "error",
      message:
        "We could not load store profile details right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function UserSummary({ user }: { user: StoreProfileUser }) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-lg font-semibold text-cyan-100">
            {getInitials(user.name)}
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl text-white">{user.name}</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Store-side account profile and access context for VendorStream.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <DetailRow label="Name" value={user.name} />
        <DetailRow label="Email" value={user.email} />
        <DetailRow
          label="Email verification"
          value={
            <StatusPill
              label={user.isEmailVerified ? "Verified" : "Pending verification"}
              tone={user.isEmailVerified ? "success" : "warning"}
            />
          }
        />
        <DetailRow label="System role" value={formatSystemRole(user.systemRole)} />
      </CardContent>
    </Card>
  );
}

function EmptyState({ user }: { user: StoreProfileUser }) {
  return (
    <div className="space-y-6">
      <UserSummary user={user} />

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl text-white">
            No store organization memberships found
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Your account is active, but no store organization memberships are
            assigned yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
            <Link href="/store/dashboard">Back to store dashboard</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link href="mailto:support@vendorstream.ca">Contact support</Link>
          </Button>
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
          Store profile data could not be loaded
        </CardTitle>
        <CardDescription className="text-sm leading-6 text-red-100/90">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button asChild className="bg-white text-slate-950 hover:bg-slate-100">
          <Link href="/store/dashboard">Back to store dashboard</Link>
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

export default async function StoreProfilePage() {
  const state = await getStoreProfilePageState();

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            Store Profile
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Account profile
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Review your VendorStream account details, store organization
              membership context, and assigned store locations.
            </p>
          </div>
        </header>

        {state.kind === "error" ? <ErrorState message={state.message} /> : null}

        {state.kind === "empty" ? <EmptyState user={state.user} /> : null}

        {state.kind === "ready" ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <SummaryCard
                label="Store Organizations"
                value={String(state.summary.membershipCount)}
                detail="Active store organization memberships assigned to your account."
                tone="neutral"
              />
              <SummaryCard
                label="Assigned Locations"
                value={String(state.summary.locationCount)}
                detail="Active store locations available within your current membership scope."
                tone="success"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <UserSummary user={state.user} />

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-xl text-white">Quick actions</CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Profile management actions can be connected once account settings
                    flows are implemented.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    type="button"
                    disabled
                    className="w-full bg-white text-slate-950 hover:bg-slate-100 disabled:bg-white/20 disabled:text-slate-400"
                  >
                    Edit profile
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    className="w-full border-white/15 bg-white/5 text-white disabled:text-slate-500"
                  >
                    Change password
                  </Button>
                  <Button
                    asChild
                    variant="ghost"
                    className="w-full text-slate-300 hover:bg-white/5 hover:text-white"
                  >
                    <Link href="/store/dashboard">Back to store dashboard</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Store organization memberships
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Real membership records for store organizations currently assigned
                  to your account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/35">
                  <table className="min-w-full border-collapse text-left">
                    <thead className="border-b border-white/8 bg-white/5">
                      <tr className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-4 py-3 font-medium">
                          Store organization
                        </th>
                        <th className="px-4 py-3 font-medium">Membership role</th>
                        <th className="px-4 py-3 font-medium">Location count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.memberships.map((membership) => (
                        <tr
                          key={membership.id}
                          className="border-b border-white/8 last:border-b-0"
                        >
                          <td className="px-4 py-4 text-sm text-white">
                            <div className="font-medium">
                              {membership.storeOrganizationName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {membership.storeOrganizationCode ?? "No code"}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {formatMembershipRole(membership.membershipRole)}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">
                            {membership.locationCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl text-white">
                  Assigned store locations
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-slate-300">
                  Active store locations available within your store organization
                  memberships.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.locations.length > 0 ? (
                  state.locations.map((location) => (
                    <div
                      key={location.id}
                      className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
                    >
                      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr_0.8fr] xl:items-start">
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Store location
                          </div>
                          <div className="text-sm font-medium text-white">
                            {location.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {location.code ?? "No code"}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Store organization
                          </div>
                          <div className="text-sm text-slate-300">
                            {location.storeOrganizationName}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            City / province
                          </div>
                          <div className="text-sm text-slate-300">
                            {location.city}, {location.province}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            Active LP assignments
                          </div>
                          <div className="text-sm text-slate-300">
                            {location.lpAssignmentCount}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
                    No active store locations are currently assigned in your
                    membership scope.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
              <PlaceholderCard
                title="Change password"
                description="Password management will connect to the authenticated account settings flow."
                actionLabel="Change password"
              />
              <PlaceholderCard
                title="Notification preferences"
                description="Store-side notification preferences can be configured once notification settings are wired."
                actionLabel="Edit notifications"
              />
              <PlaceholderCard
                title="Profile image / avatar"
                description="Avatar upload and profile image management can be added when media settings are available."
                actionLabel="Update avatar"
              />
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
