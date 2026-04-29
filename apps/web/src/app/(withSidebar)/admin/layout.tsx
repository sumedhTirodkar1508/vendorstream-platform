import { ForbiddenSectionState } from "@/components/forbidden-section-state";
import {
  canAccessAdminSection,
  getAccessSnapshot,
} from "@/lib/authz";

export default async function AdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAccessSnapshot();

  if (!canAccessAdminSection(access)) {
    return (
      <ForbiddenSectionState
        title="Admin access required"
        description="This area is limited to VendorStream administrators. Your current account does not have access to the admin workspace."
        homeHref={access.defaultHomeHref}
      />
    );
  }

  return children;
}
