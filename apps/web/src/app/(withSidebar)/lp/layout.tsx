import { ForbiddenSectionState } from "@/components/forbidden-section-state";
import { canAccessLpSection, getAccessSnapshot } from "@/lib/authz";

export default async function LpSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAccessSnapshot();

  if (!canAccessLpSection(access)) {
    return (
      <ForbiddenSectionState
        title="LP workspace access required"
        description="This area is reserved for users with LP memberships or VendorStream administrators. Your current account does not have LP-scoped access."
        homeHref={access.defaultHomeHref}
      />
    );
  }

  return children;
}
