"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { StoreUploadAssignmentOption } from "@/lib/store-upload-context";
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

type StoreUploadFormProps = {
  options: StoreUploadAssignmentOption[];
  initialValues?: {
    lpId?: string;
    storeLocationId?: string;
    month?: string;
  };
};

const ACCEPTED_FILE_TYPES = [".xlsx", ".xls", ".xlsm"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

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

function isMonthValue(value: string | undefined) {
  return typeof value === "string" && /^\d{4}-\d{2}$/.test(value);
}

export function StoreUploadForm({
  options,
  initialValues,
}: StoreUploadFormProps) {
  const initialAssignment =
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
  const [selectedLpId, setSelectedLpId] = useState(
    initialAssignment?.lpId ?? "",
  );
  const [selectedStoreLocationId, setSelectedStoreLocationId] = useState(
    initialAssignment?.storeLocationId ?? "",
  );
  const [month, setMonth] = useState<string>(
    isMonthValue(initialValues?.month) ? (initialValues?.month as string) : "",
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
    setUploadProgress(20);

    try {
      const formData = new FormData();
      formData.append("lpId", selectedAssignment.lpId);
      formData.append("storeLocationId", selectedAssignment.storeLocationId);
      formData.append("month", month);
      formData.append("file", file);

      const response = await fetch("/api/store/uploads", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        message?: string;
        uploadedFileId?: string;
        importBatchId?: string;
        cycleId?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error || "Unable to create the store upload right now.",
        );
      }

      setUploadProgress(100);
      setCreatedBatchId(payload?.importBatchId ?? null);
      setCreatedCycleId(payload?.cycleId ?? null);
      setNotice({
        type: "success",
        text:
          payload?.message ||
          `Store upload accepted for ${formatMonthLabel(month)}. VendorStream created the cycle linkage and import batch record.`,
      });
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
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">Upload form</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Select the LP, store location, reporting month, and source workbook
            for the next store-side import batch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lpId" className="text-slate-200">
                  LP
                </Label>
                <select
                  id="lpId"
                  name="lpId"
                  value={selectedLpId}
                  onChange={(event) => handleLpChange(event.target.value)}
                  disabled={isUploading}
                  className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
                >
                  {lpOptions.map((option) => (
                    <option key={option.lpId} value={option.lpId}>
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
                  name="storeLocationId"
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
                Uploading for {selectedAssignment.storeOrganizationName} ·{" "}
                {selectedAssignment.storeLocationName} ·{" "}
                {selectedAssignment.lpName}.
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
              <div className="space-y-2">
                <Label htmlFor="month" className="text-slate-200">
                  Reporting month
                </Label>
                <Input
                  id="month"
                  name="month"
                  type="month"
                  value={month}
                  onChange={(event) => {
                    setMonth(event.target.value);
                    setNotice(null);
                    setCreatedBatchId(null);
                    setCreatedCycleId(null);
                  }}
                  disabled={isUploading}
                  className="border-white/10 bg-slate-950/60 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file" className="text-slate-200">
                  Store file
                </Label>
                <Input
                  ref={fileInputRef}
                  id="file"
                  name="file"
                  type="file"
                  accept={ACCEPTED_FILE_TYPES.join(",")}
                  onChange={handleFileChange}
                  disabled={isUploading}
                  className="border-white/10 bg-slate-950/60 text-white file:mr-4 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-950 hover:file:bg-slate-100"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4 text-sm text-slate-300">
              <div className="font-medium text-white">Selected month</div>
              <div className="mt-1">{formatMonthLabel(month)}</div>
              {file ? (
                <div className="mt-3">
                  {file.name} · {formatBytes(file.size)}
                </div>
              ) : null}
            </div>

            {notice ? (
              <div
                className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${
                  notice.type === "success"
                    ? "border-emerald-400/20 bg-emerald-500/8 text-emerald-100"
                    : "border-red-400/20 bg-red-500/8 text-red-100"
                }`}
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
                    {createdCycleId ? (
                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/store/uploads?batchId=${createdBatchId ?? ""}`}
                          className="font-medium text-white underline underline-offset-4"
                        >
                          View store uploads
                        </Link>
                        <Link
                          href="/store/dashboard"
                          className="font-medium text-white underline underline-offset-4"
                        >
                          Return to store dashboard
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Upload status</span>
                <span>
                  {isUploading
                    ? `Uploading ${uploadProgress}%`
                    : uploadProgress === 100
                      ? "Completed"
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
                {isUploading ? "Uploading..." : "Submit store file"}
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
                <Link href="/store/uploads">Cancel</Link>
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
              Use the final monthly store workbook with the original exported
              structure intact.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              Accepted file types: {ACCEPTED_FILE_TYPES.join(", ")}
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              Keep uploads under {formatBytes(MAX_FILE_SIZE_BYTES)}.
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              Barcode, unit, and sales fields should remain unchanged from the
              source export.
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              Store uploads are matched against the LP counterpart file for the
              same cycle month.
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-lg text-white">
              Validation expectations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              VendorStream will create or reuse the correct reconciliation cycle
              for the selected LP, store location, and month.
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              A current store-side `ImportBatch` and `UploadedFile` record will
              be created immediately.
            </div>
            <div className="rounded-xl border border-white/8 bg-slate-950/35 px-4 py-3">
              TODO: direct file storage, row parsing, and background validation
              will be connected to this submit path next.
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
              1. VendorStream links the upload to a reconciliation cycle
            </div>
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
              2. An `ImportBatch` is created and marked as the current store
              batch for that cycle
            </div>
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
              3. Parsing, validation, and reconciliation processing can continue
              once storage and worker steps are fully wired
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
