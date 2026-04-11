import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma } from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  LpUploadForm,
  type LpUploadOption,
} from "@/components/lp-upload-form";
import { getLpAccessContextForUser } from "@/lib/lp-access-context";
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

export default async function LpMonthlyUploadPage({
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

  if (!session.user.id) {
    redirect("/login");
  }

  const context = await getLpAccessContextForUser({
    userId: session.user.id,
    systemRole: session.user.systemRole,
  });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedLpId = resolvedSearchParams?.lpId?.trim() ?? "";
  const requestedStoreLocationId =
    resolvedSearchParams?.storeLocationId?.trim() ?? "";
  const requestedMonth = resolvedSearchParams?.month?.trim() ?? "";

  const assignments = context.lpIds.length
    ? await prisma.storeLocationLpAssignment.findMany({
        where: {
          lpId: {
            in: context.lpIds,
          },
          isActive: true,
          lp: {
            isActive: true,
          },
          storeLocation: {
            isActive: true,
            storeOrganization: {
              isActive: true,
            },
          },
        },
        select: {
          lpId: true,
          lp: {
            select: {
              name: true,
              code: true,
            },
          },
          storeLocationId: true,
          storeLocation: {
            select: {
              name: true,
              code: true,
              storeOrganization: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [
          { lp: { name: "asc" } },
          { storeLocation: { storeOrganization: { name: "asc" } } },
          { storeLocation: { name: "asc" } },
        ],
      })
    : [];

  const options: LpUploadOption[] = assignments.map((assignment) => ({
    lpId: assignment.lpId,
    lpName: assignment.lp.name,
    lpCode: assignment.lp.code,
    storeLocationId: assignment.storeLocationId,
    storeLocationName: assignment.storeLocation.name,
    storeLocationCode: assignment.storeLocation.code,
    storeOrganizationName: assignment.storeLocation.storeOrganization.name,
  }));

  const initialAssignment =
    options.find(
      (option) =>
        option.lpId === requestedLpId &&
        option.storeLocationId === requestedStoreLocationId,
    ) ??
    options.find((option) => option.lpId === requestedLpId) ??
    options.find(
      (option) => option.storeLocationId === requestedStoreLocationId,
    ) ??
    null;

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
            LP Uploads
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Upload monthly LP source file
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Submit the licensed producer Excel workbook for the selected store
              location and reporting month. VendorStream uploads the file
              directly to Supabase Storage, then creates the linked
              `UploadedFile`, `ImportBatch`, and reconciliation cycle records.
            </p>
          </div>
        </header>

        {options.length === 0 ? (
          <Card className="border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl text-white">
                No LP upload options available
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-amber-100/90">
                We could not find any active store locations assigned to your LP
                access scope for upload creation.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/lp/profile">Open profile</Link>
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
        ) : (
          <LpUploadForm
            options={options}
            initialValues={{
              lpId: initialAssignment?.lpId,
              storeLocationId: initialAssignment?.storeLocationId,
              month: isMonthValue(requestedMonth) ? requestedMonth : undefined,
            }}
            isAdminPreview={context.isFallbackContext}
          />
        )}
      </div>
    </main>
  );
}
