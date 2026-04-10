import { permanentRedirect } from "next/navigation";

export default function LpDashboardRedirectPage() {
  permanentRedirect("/dashboard");
}
