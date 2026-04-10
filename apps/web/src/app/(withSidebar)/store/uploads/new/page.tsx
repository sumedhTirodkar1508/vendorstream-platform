import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { StoreUploadForm } from "@/components/store-upload-form";
import { getStoreUploadContextForUser } from "@/lib/store-upload-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function isMonthValue(value: string | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

export default async function StoreUploadNewPage({
  searchParams,
}: {
  searchParams?: Promise<{
    lpId?: string;
    storeLocationId?: string;
    month?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const userId = session.user.id;

  if (!userId) {
    redirect("/login");
  }

  const context = await getStoreUploadContextForUser({
    userId,
    systemRole: session.user.systemRole,
  });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLpId = resolvedSearchParams?.lpId?.trim() ?? "";
  const requestedStoreLocationId =
    resolvedSearchParams?.storeLocationId?.trim() ?? "";
  const requestedMonth = resolvedSearchParams?.month?.trim() ?? "";

  const initialAssignment =
    context.options.find(
      (option) =>
        option.lpId === requestedLpId &&
        option.storeLocationId === requestedStoreLocationId,
    ) ??
    context.options.find((option) => option.lpId === requestedLpId) ??
    context.options.find(
      (option) => option.storeLocationId === requestedStoreLocationId,
    ) ??
    null;

  if (context.options.length === 0) {
    return (
      <main className="relative min-h-screen overflow-hidden text-white">
        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
          <header className="space-y-3">
            <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
              Store Uploads
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Upload monthly store source file
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Store-side upload options are based on your real store
                organization memberships and active LP assignments.
              </p>
            </div>
          </header>

          <Card className="border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl text-white">
                No upload options are available
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-amber-100/90">
                We could not find any active store locations with LP assignments
                in your current access scope.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
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
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            Store Uploads
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Upload monthly store source file
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Submit the store-side Excel workbook for a selected LP, store
              location, and reporting month. VendorStream will create the linked
              `UploadedFile`, `ImportBatch`, and reconciliation cycle context.
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
            Working in{" "}
            <span className="font-medium text-white">
              {context.primaryStoreOrganizationName}
            </span>
            {context.totalStoreOrganizations > 1
              ? ` and ${context.totalStoreOrganizations - 1} more store organizations`
              : ""}
            . {context.totalLocations} active store
            {context.totalLocations === 1 ? " location" : " locations"} with LP
            assignment coverage are available for upload.
            {context.isFallbackContext
              ? " TODO: replace admin fallback behavior with explicit store organization switching."
              : ""}
          </div>
        </header>

        <StoreUploadForm
          options={context.options}
          initialValues={{
            lpId: initialAssignment?.lpId,
            storeLocationId: initialAssignment?.storeLocationId,
            month: isMonthValue(requestedMonth) ? requestedMonth : undefined,
          }}
        />
      </div>
    </main>
  );
}
