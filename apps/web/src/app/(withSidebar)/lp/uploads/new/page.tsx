"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type MembershipRole = "LP_ADMIN" | "LP_MANAGER" | "LP_VIEWER";
type UploadNotice =
  | { type: "error"; text: string }
  | { type: "success"; text: string };

type LpMembershipOption = {
  id: string;
  lpId: string;
  lpName: string;
  lpCode: string;
  membershipRole: MembershipRole;
  isCurrent: boolean;
};

const ACCEPTED_FILE_TYPES = [".xlsx", ".xls", ".xlsm"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const mockMemberships: LpMembershipOption[] = [
  {
    id: "membership-northstar",
    lpId: "lp-northstar",
    lpName: "Northstar Beverage Group",
    lpCode: "LP-204",
    membershipRole: "LP_ADMIN",
    isCurrent: true,
  },
  {
    id: "membership-harbor",
    lpId: "lp-harbor",
    lpName: "Harbor Ridge Wines",
    lpCode: "LP-118",
    membershipRole: "LP_VIEWER",
    isCurrent: false,
  },
];

function formatBytes(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.ceil(size / 1024)} KB`;
}

function formatMonthLabel(value: string) {
  if (!value) {
    return "Select month";
  }

  const [year, month] = value.split("-");
  const parsedDate = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function isAcceptedFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_FILE_TYPES.some((extension) => lowerName.endsWith(extension));
}

export default function LpMonthlyUploadPage() {
  const [memberships] = useState<LpMembershipOption[]>(mockMemberships);
  const currentMembership = useMemo(
    () => memberships.find((membership) => membership.isCurrent) ?? memberships[0],
    [memberships],
  );

  const [selectedLpId, setSelectedLpId] = useState(currentMembership?.lpId ?? "");
  const [month, setMonth] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<UploadNotice | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const progressTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  const selectedMembership = useMemo(
    () =>
      memberships.find((membership) => membership.lpId === selectedLpId) ??
      currentMembership,
    [currentMembership, memberships, selectedLpId],
  );

  const hasMultipleMemberships = memberships.length > 1;
  const isSubmitDisabled = !selectedLpId || !month || !file || isUploading;

  const startProgressAnimation = () => {
    setUploadProgress(10);

    progressTimerRef.current = window.setInterval(() => {
      setUploadProgress((current) => {
        if (current >= 90) {
          return current;
        }

        return current + (current < 50 ? 12 : 6);
      });
    }, 250);
  };

  const stopProgressAnimation = () => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const resetFile = () => {
    setFile(null);
    setUploadProgress(0);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;

    setNotice(null);
    setUploadProgress(0);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!isAcceptedFile(nextFile)) {
      setFile(null);
      setNotice({
        type: "error",
        text: `Upload a supported Excel file: ${ACCEPTED_FILE_TYPES.join(", ")}.`,
      });
      event.target.value = "";
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setNotice({
        type: "error",
        text: `File is too large. Keep uploads under ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
      });
      event.target.value = "";
      return;
    }

    setFile(nextFile);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitDisabled || !selectedMembership || !file) {
      return;
    }

    setIsUploading(true);
    setNotice(null);
    startProgressAnimation();

    try {
      const formData = new FormData();
      formData.append("lpId", selectedMembership.lpId);
      formData.append("month", month);
      formData.append("file", file);

      const response = await fetch("/api/lp/uploads", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            message?: string;
            uploadedFileId?: string;
            importBatchId?: string;
          }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.error || "Unable to create the monthly upload right now.",
        );
      }

      stopProgressAnimation();
      setUploadProgress(100);
      setNotice({
        type: "success",
        text:
          payload?.message ||
          `Monthly LP file queued for ${formatMonthLabel(month)}. Processing will begin after storage and batch creation are connected.`,
      });
    } catch (error) {
      stopProgressAnimation();
      setUploadProgress(0);
      setNotice({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "An unexpected upload error occurred.",
      });
    } finally {
      setIsUploading(false);
    }
  };

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
              Submit the licensed producer Excel workbook for a reporting month.
              VendorStream will later connect this to direct storage upload,
              `UploadedFile` and `ImportBatch` creation, and background
              reconciliation processing.
            </p>
          </div>
        </header>

        {memberships.length === 0 ? (
          <Card className="border border-amber-400/20 bg-amber-500/8 shadow-2xl backdrop-blur-xl">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl text-white">
                No LP memberships available
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-amber-100/90">
                Your account does not currently have access to any licensed
                producer context. An administrator must assign LP membership
                before monthly uploads can begin.
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
                <Link href="mailto:support@vendorstream.ca">
                  Contact administrator
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
              <CardHeader className="space-y-3">
                <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
                  VendorStream
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-3xl text-white">
                    Monthly upload details
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Validate the LP context, choose a reporting month, and
                    upload the source workbook used for reconciliation.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <form className="space-y-6" onSubmit={handleSubmit}>
                  {notice ? (
                    <div
                      className={[
                        "rounded-xl border px-4 py-3 text-sm leading-6",
                        notice.type === "error"
                          ? "border-red-400/30 bg-red-500/10 text-red-100"
                          : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
                      ].join(" ")}
                    >
                      {notice.text}
                    </div>
                  ) : null}

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="lp-context" className="text-slate-200">
                        LP context
                      </Label>
                      {hasMultipleMemberships ? (
                        <select
                          id="lp-context"
                          value={selectedLpId}
                          onChange={(event) => setSelectedLpId(event.target.value)}
                          className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                        >
                          {memberships.map((membership) => (
                            <option
                              key={membership.id}
                              value={membership.lpId}
                              className="bg-slate-950 text-white"
                            >
                              {membership.lpName} ({membership.lpCode})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm leading-6 text-slate-200">
                          {selectedMembership?.lpName} ({selectedMembership?.lpCode})
                        </div>
                      )}
                      <p className="text-xs leading-5 text-slate-400">
                        {selectedMembership?.membershipRole} access for this LP
                        membership.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reporting-month" className="text-slate-200">
                        Reporting month
                      </Label>
                      <Input
                        id="reporting-month"
                        type="month"
                        value={month}
                        onChange={(event) => setMonth(event.target.value)}
                        className="h-11 border-white/10 bg-slate-950/60 text-white focus-visible:border-cyan-300/40 focus-visible:ring-cyan-300/20"
                      />
                      <p className="text-xs leading-5 text-slate-400">
                        Statements are generated per LP + store location + month.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lp-file" className="text-slate-200">
                      LP Excel file
                    </Label>
                    <Input
                      id="lp-file"
                      type="file"
                      accept={ACCEPTED_FILE_TYPES.join(",")}
                      onChange={handleFileChange}
                      className="h-11 border-white/10 bg-slate-950/60 text-white file:mr-3 file:rounded-md file:bg-white/10 file:px-3 file:text-white focus-visible:border-cyan-300/40 focus-visible:ring-cyan-300/20"
                    />
                    <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3 text-xs leading-6 text-slate-300">
                      <div>Accepted file types: {ACCEPTED_FILE_TYPES.join(", ")}</div>
                      <div>Recommended limit: under {formatBytes(MAX_FILE_SIZE_BYTES)}</div>
                      <div>
                        Ensure the workbook includes the final LP monthly export
                        for the selected reporting month.
                      </div>
                    </div>
                  </div>

                  {file ? (
                    <div className="rounded-xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm">
                      <div className="font-medium text-white">{file.name}</div>
                      <div className="mt-1 text-slate-400">
                        {formatBytes(file.size)} · queued for{" "}
                        {formatMonthLabel(month)}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">Upload progress</span>
                      <span className="text-slate-400">
                        {isUploading || uploadProgress > 0
                          ? `${uploadProgress}%`
                          : "Not started"}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/8">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#67e8f9_0%,#38bdf8_55%,#e2e8f0_100%)] transition-[width] duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      disabled={isSubmitDisabled}
                      className="bg-white text-slate-950 hover:bg-slate-100"
                    >
                      {isUploading ? "Uploading..." : "Submit monthly file"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={resetFile}
                      disabled={isUploading}
                      className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                    >
                      Clear file
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-lg text-white">
                    Validation checklist
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    Files should be ready for normalization and reconciliation
                    processing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-300">
                  <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
                    Upload only the final LP workbook for the selected month.
                  </div>
                  <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
                    Barcode formatting and price fields should remain unchanged
                    from the source export.
                  </div>
                  <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
                    Store counterpart uploads must still arrive before statement
                    generation can complete.
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-lg text-white">
                    Next integration steps
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-300">
                    This page is wired to a placeholder API while backend upload
                    services are finalized.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-300">
                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
                    1. Direct upload to Supabase Storage
                  </div>
                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
                    2. Create `UploadedFile` and `ImportBatch` records
                  </div>
                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
                    3. Queue background validation and reconciliation jobs
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
                <CardHeader className="space-y-2">
                  <CardTitle className="text-lg text-white">
                    Quick actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-center border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Link href="/lp/uploads">View Import History</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-center border-white/15 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Link href="/dashboard">Back to Dashboard</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
