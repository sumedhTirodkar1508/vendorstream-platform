import { ForbiddenSectionState } from "@/components/forbidden-section-state";
import { canAccessStoreSection, getAccessSnapshot } from "@/lib/authz";

export default async function StoreSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAccessSnapshot();

  if (!canAccessStoreSection(access)) {
    return (
      <ForbiddenSectionState
        title="Store workspace access required"
        description="This area is reserved for users with store-organization memberships or VendorStream administrators. Your current account does not have store-scoped access."
        homeHref={access.defaultHomeHref}
      />
    );
  }

  return children;
}
