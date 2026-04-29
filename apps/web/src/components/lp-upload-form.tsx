"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { runDirectImportUpload } from "@/lib/direct-upload-client";
import {
  ACCEPTED_IMPORT_UPLOAD_FILE_EXTENSIONS,
  MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES,
  type UploadSourceType,
} from "@/lib/import-upload";
import { formatMonthLabel as sharedFormatMonthLabel } from "@/lib/format";
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

type UploadNotice =
  | { type: "error"; text: string }
  | { type: "success"; text: string };

export type LpUploadOption = {
  lpId: string;
  lpName: string;
  lpCode: string | null;
  storeLocationId: string;
  storeLocationName: string;
  storeLocationCode: string | null;
  storeOrganizationName: string;
};

type LpUploadFormProps = {
  options: LpUploadOption[];
  initialValues?: {
    lpId?: string;
    storeLocationId?: string;
    month?: string;
  };
  isAdminPreview?: boolean;
};

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

  return sharedFormatMonthLabel(value);
}

function isMonthValue(value: string | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

function isAcceptedFile(file: File) {
  const lowerName = file.name.toLowerCase();

  return ACCEPTED_IMPORT_UPLOAD_FILE_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );
}

export function LpUploadForm({
  options,
  initialValues,
  isAdminPreview = false,
}: LpUploadFormProps) {
  const router = useRouter();
  const initialOption =
    options.find(
      (option) =>
        option.lpId === initialValues?.lpId &&
        option.storeLocationId === initialValues?.storeLocationId,
    ) ??
    options.find((option) => option.lpId === initialValues?.lpId) ??
    options.find(
      (option) => option.storeLocationId === initialValues?.storeLocationId,
    ) ??
    options[0] ??
    null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedLpId, setSelectedLpId] = useState(initialOption?.lpId ?? "");
  const [selectedStoreLocationId, setSelectedStoreLocationId] = useState(
    initialOption?.storeLocationId ?? "",
  );
  const [month, setMonth] = useState(
    isMonthValue(initialValues?.month) ? initialValues?.month ?? "" : "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<UploadNotice | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [createdCycleId, setCreatedCycleId] = useState<string | null>(null);

  const lpOptions = useMemo(
    () =>
      Array.from(
        new Map(
          options.map((option) => [
            option.lpId,
            {
              lpId: option.lpId,
              lpName: option.lpName,
              lpCode: option.lpCode,
            },
          ]),
        ).values(),
      ),
    [options],
  );

  const compatibleStoreLocations = useMemo(() => {
    const matchingOptions = options.filter(
      (option) => option.lpId === selectedLpId,
    );

    return Array.from(
      new Map(
        matchingOptions.map((option) => [
          option.storeLocationId,
          {
            storeLocationId: option.storeLocationId,
            storeLocationName: option.storeLocationName,
            storeLocationCode: option.storeLocationCode,
            storeOrganizationName: option.storeOrganizationName,
          },
        ]),
      ).values(),
    );
  }, [options, selectedLpId]);

  const selectedAssignment = useMemo(
    () =>
      options.find(
        (option) =>
          option.lpId === selectedLpId &&
          option.storeLocationId === selectedStoreLocationId,
      ) ?? null,
    [options, selectedLpId, selectedStoreLocationId],
  );

  const isSubmitDisabled =
    !selectedAssignment || !month || !file || isUploading;

  const handleLpChange = (nextLpId: string) => {
    setSelectedLpId(nextLpId);
    setNotice(null);
    setCreatedBatchId(null);
    setCreatedCycleId(null);

    const nextLocation =
      options.find(
        (option) =>
          option.lpId === nextLpId &&
          option.storeLocationId === selectedStoreLocationId,
      ) ??
      options.find((option) => option.lpId === nextLpId) ??
      null;

    setSelectedStoreLocationId(nextLocation?.storeLocationId ?? "");
  };

  const handleStoreLocationChange = (nextStoreLocationId: string) => {
    setSelectedStoreLocationId(nextStoreLocationId);
    setNotice(null);
    setCreatedBatchId(null);
    setCreatedCycleId(null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;

    setNotice(null);
    setCreatedBatchId(null);
    setCreatedCycleId(null);
    setUploadProgress(0);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!isAcceptedFile(nextFile)) {
      setFile(null);
      setNotice({
        type: "error",
        text: `Upload a supported Excel file: ${ACCEPTED_IMPORT_UPLOAD_FILE_EXTENSIONS.join(", ")}.`,
      });
      event.target.value = "";
      return;
    }

    if (nextFile.size > MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES) {
      setFile(null);
      setNotice({
        type: "error",
        text: `File is too large. Keep uploads under ${formatBytes(MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES)}.`,
      });
      event.target.value = "";
      return;
    }

    setFile(nextFile);
  };

  const resetFile = () => {
    setFile(null);
    setUploadProgress(0);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedAssignment || !file || isSubmitDisabled) {
      return;
    }

    setIsUploading(true);
    setNotice(null);
    setCreatedBatchId(null);
    setCreatedCycleId(null);

    try {
      const payload = await runDirectImportUpload({
        intent: {
          sourceType: "LP" satisfies UploadSourceType,
          lpId: selectedAssignment.lpId,
          storeLocationId: selectedAssignment.storeLocationId,
          month,
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: file.type || null,
        },
        file,
        onProgressChange: setUploadProgress,
      });

      setCreatedBatchId(payload.importBatchId);
      setCreatedCycleId(payload.cycleId);
      setNotice({
        type: "success",
        text:
          payload.message ||
          `LP upload queued for validation for ${formatMonthLabel(month)}.`,
      });
      router.push(`/lp/uploads/${payload.importBatchId}`);
    } catch (error) {
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
              Select the LP, assigned store location, reporting month, and
              source workbook used for reconciliation.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            {isAdminPreview ? (
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                Admin preview is showing LP upload options across active LP
                assignments because no explicit LP membership is attached to
                this user.
              </div>
            ) : null}

            {notice ? (
              <div
                className={[
                  "rounded-xl border px-4 py-3 text-sm leading-6",
                  notice.type === "error"
                    ? "border-red-400/30 bg-red-500/10 text-red-100"
                    : "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
                ].join(" ")}
              >
                <div>{notice.text}</div>
                {notice.type === "success" ? (
                  <div className="mt-3 space-y-2 text-sm">
                    {createdBatchId ? (
                      <div className="text-emerald-100/90">
                        Created import batch:{" "}
                        <span className="font-medium text-white">
                          {createdBatchId}
                        </span>
                      </div>
                    ) : null}
                    {createdCycleId ? (
                      <div className="text-emerald-100/90">
                        Linked reconciliation cycle:{" "}
                        <span className="font-medium text-white">
                          {createdCycleId}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      {createdBatchId ? (
                        <Link
                          href={`/lp/uploads/${createdBatchId}`}
                          className="font-medium text-white underline underline-offset-4"
                        >
                          View upload details
                        </Link>
                      ) : null}
                      {createdCycleId ? (
                        <Link
                          href={`/lp/cycles/${createdCycleId}`}
                          className="font-medium text-white underline underline-offset-4"
                        >
                          Review cycle
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lp-context" className="text-slate-200">
                  LP
                </Label>
                <select
                  id="lp-context"
                  value={selectedLpId}
                  onChange={(event) => handleLpChange(event.target.value)}
                  disabled={isUploading}
                  className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                >
                  {lpOptions.map((option) => (
                    <option
                      key={option.lpId}
                      value={option.lpId}
                      className="bg-slate-950 text-white"
                    >
                      {option.lpName}
                      {option.lpCode ? ` (${option.lpCode})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="storeLocationId" className="text-slate-200">
                  Store location
                </Label>
                <select
                  id="storeLocationId"
                  value={selectedStoreLocationId}
                  onChange={(event) =>
                    handleStoreLocationChange(event.target.value)
                  }
                  disabled={isUploading}
                  className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                >
                  {compatibleStoreLocations.map((option) => (
                    <option
                      key={option.storeLocationId}
                      value={option.storeLocationId}
                    >
                      {option.storeLocationName}
                      {option.storeLocationCode
                        ? ` (${option.storeLocationCode})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedAssignment ? (
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-4 text-sm leading-6 text-cyan-100">
                Uploading for {selectedAssignment.lpName} ·{" "}
                {selectedAssignment.storeOrganizationName} ·{" "}
                {selectedAssignment.storeLocationName}.
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
              <div className="space-y-2">
                <Label htmlFor="month" className="text-slate-200">
                  Reporting month
                </Label>
                <Input
                  id="month"
                  type="month"
                  value={month}
                  onChange={(event) => {
                    setMonth(event.target.value);
                    setNotice(null);
                    setCreatedBatchId(null);
                    setCreatedCycleId(null);
                  }}
                  disabled={isUploading}
                  className="h-11 border-white/10 bg-slate-950/60 text-white focus-visible:border-cyan-300/40 focus-visible:ring-cyan-300/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lp-file" className="text-slate-200">
                  LP workbook
                </Label>
                <Input
                  ref={fileInputRef}
                  id="lp-file"
                  type="file"
                  accept={ACCEPTED_IMPORT_UPLOAD_FILE_EXTENSIONS.join(",")}
                  onChange={handleFileChange}
                  disabled={isUploading}
                  className="h-11 border-white/10 bg-slate-950/60 text-white file:mr-3 file:rounded-md file:bg-white/10 file:px-3 file:text-white focus-visible:border-cyan-300/40 focus-visible:ring-cyan-300/20"
                />
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
              <div className="font-medium text-white">Selected month</div>
              <div className="mt-1">{formatMonthLabel(month)}</div>
              {file ? (
                <div className="mt-3">
                  {file.name} · {formatBytes(file.size)}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Upload status</span>
                <span>
                  {isUploading
                    ? `Uploading ${uploadProgress}%`
                    : uploadProgress === 100
                      ? "Queued for validation"
                      : "Waiting"}
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
              <Button
                asChild
                type="button"
                variant="ghost"
                className="text-slate-300 hover:bg-white/5 hover:text-white"
              >
                <Link href="/lp/uploads">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg text-white">
              Upload guidance
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Use the final monthly LP workbook with the original exported
              structure intact.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              Accepted file types:{" "}
              {ACCEPTED_IMPORT_UPLOAD_FILE_EXTENSIONS.join(", ")}
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              Keep uploads under {formatBytes(MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES)}.
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              Barcode, unit, and sales fields should remain unchanged from the
              LP source export.
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              LP uploads are linked directly to the selected store location
              cycle for the same reporting month.
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg text-white">
              What happens next
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
              1. VendorStream creates a signed upload URL and stores the file
              directly in Supabase Storage
            </div>
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
              2. An `UploadedFile` record and LP `ImportBatch` are created
              after storage verification
            </div>
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
              3. The linked reconciliation cycle is created or refreshed and is
              ready for downstream parsing work
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
              <Link href="/lp/uploads">View import history</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full justify-center border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
