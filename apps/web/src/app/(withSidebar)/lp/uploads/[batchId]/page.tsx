import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { prisma, type $Enums, type Prisma } from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { PageErrorState } from "@/components/page-error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { BatchStatusPoller } from "@/components/batch-status-poller";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { retryImportBatchProcessingAction } from "@/app/(withSidebar)/actions/retry-processing";
import { canRetryImportBatch } from "@/lib/processing-retry-rules";
import {
  formatDateTime,
  formatEnumLabel,
  formatFileSize,
  formatMonthLabel,
} from "@/lib/format";
import {
  getCycleStatusBadgeClassName,
  getImportBatchStatusBadgeClassName,
} from "@/lib/status-badges";

type BatchSourceType = $Enums.BatchSourceType;
type CycleStatus = $Enums.CycleStatus;
type ImportBatchStatus = $Enums.ImportBatchStatus;
type LpMembershipRole = $Enums.LpMembershipRole;

const LP_MANAGEABLE_ROLES: LpMembershipRole[] = ["LP_ADMIN", "LP_MANAGER"];

type BatchDetailsState =
  | {
      kind: "ready";
      batch: {
        id: string;
        shortLabel: string;
        sourceType: BatchSourceType;
        status: ImportBatchStatus;
        uploadedAt: Date | null;
        uploadedBy: {
          name: string | null;
          email: string | null;
        } | null;
        createdAt: Date;
        updatedAt: Date;
        processedAt: Date | null;
        failedAt: Date | null;
        isCurrent: boolean;
        file: {
          originalFilename: string;
          bucket: string;
          storagePath: string;
          mimeType: string | null;
          sizeBytes: bigint;
          checksumSha256: string | null;
          fileKind: string;
        };
        processing: {
          totalRows: number | null;
          validRows: number | null;
          invalidRows: number | null;
          rawRowCount: number;
          normalizedRowCount: number;
        };
        validation: {
          preValidationErrors: Prisma.JsonValue | null;
          validationSummary: Prisma.JsonValue | null;
          errorMessage: string | null;
        };
        cycle: {
          id: string;
          lpName: string;
          lpCode: string | null;
          storeOrganization: string;
          storeLocation: string;
          periodMonth: Date;
          status: CycleStatus;
        };
        canRetryBatch: boolean;
        timeline: Array<{
          id: string;
          label: string;
          description: string;
          occurredAt: Date | null;
          tone: "neutral" | "success" | "warning";
        }>;
      };
    }
  | {
      kind: "missing";
      batchId: string;
    }
  | {
      kind: "forbidden";
    }
  | {
      kind: "error";
      message: string;
    };

function formatSourceType(value: BatchSourceType) {
  return value === "LP" ? "LP" : "Store";
}

function getJsonObject(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getValidationErrorMessage(value: Prisma.JsonValue | null) {
  const object = getJsonObject(value);
  const errorMessage = object?.errorMessage;

  return typeof errorMessage === "string" && errorMessage.trim()
    ? errorMessage
    : null;
}

function JsonPanel({
  title,
  description,
  value,
}: {
  title: string;
  description: string;
  value: Prisma.JsonValue | null;
}) {
  return (
    <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg text-white">{title}</CardTitle>
        <CardDescription className="text-sm leading-6 text-slate-300">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {value ? (
          <pre className="overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/45 p-4 text-xs leading-6 text-slate-200">
            {JSON.stringify(value, null, 2)}
          </pre>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/30 px-4 py-5 text-sm text-slate-400">
            No structured data is available yet for this section.
          </div>
        )}
      </CardContent>
    </Card>
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

async function getBatchDetailsState(
  batchId: string,
): Promise<BatchDetailsState> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  try {
    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      include: {
        uploadedFile: true,
        uploadedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        cycle: {
          include: {
            lp: {
              select: {
                name: true,
                code: true,
                memberships: {
                  where: {
                    userId: session.user.id ?? "",
                  },
                  select: {
                    role: true,
                  },
                },
              },
            },
            storeLocation: {
              include: {
                storeOrganization: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            rawLpRows: true,
            rawStoreRows: true,
            normalizedLpRows: true,
            normalizedStoreRows: true,
          },
        },
      },
    });

    if (!batch) {
      return {
        kind: "missing",
        batchId,
      };
    }

    const isAdmin = session.user.systemRole === "ADMIN";
    const hasLpMembership = batch.cycle.lp.memberships.length > 0;
    const canManageBatchProcessing =
      isAdmin ||
      batch.cycle.lp.memberships.some((membership) =>
        LP_MANAGEABLE_ROLES.includes(membership.role),
      );

    if (!isAdmin && !hasLpMembership) {
      return { kind: "forbidden" };
    }

    const rawRowCount =
      batch.sourceType === "LP"
        ? batch._count.rawLpRows
        : batch._count.rawStoreRows;
    const normalizedRowCount =
      batch.sourceType === "LP"
        ? batch._count.normalizedLpRows
        : batch._count.normalizedStoreRows;

    const totalRows =
      batch.totalRowCount ?? (rawRowCount > 0 ? rawRowCount : null);
    const validRows =
      batch.validRowCount ??
      (normalizedRowCount > 0 ? normalizedRowCount : null);
    const invalidRows =
      batch.invalidRowCount ??
      (totalRows !== null && validRows !== null
        ? Math.max(totalRows - validRows, 0)
        : null);

    return {
      kind: "ready",
      batch: {
        id: batch.id,
        shortLabel: `Batch ${batch.id.slice(0, 8)}`,
        sourceType: batch.sourceType,
        status: batch.status,
        uploadedAt: batch.uploadedFile.uploadedAt,
        uploadedBy: batch.uploadedBy,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        processedAt: batch.processedAt,
        failedAt: batch.failedAt,
        isCurrent: batch.isCurrent,
        file: {
          originalFilename: batch.uploadedFile.originalFilename,
          bucket: batch.uploadedFile.bucket,
          storagePath: batch.uploadedFile.storagePath,
          mimeType: batch.uploadedFile.mimeType,
          sizeBytes: batch.uploadedFile.sizeBytes,
          checksumSha256: batch.uploadedFile.checksumSha256,
          fileKind: batch.uploadedFile.fileKind,
        },
        processing: {
          totalRows,
          validRows,
          invalidRows,
          rawRowCount,
          normalizedRowCount,
        },
        validation: {
          preValidationErrors: batch.preValidationErrors,
          validationSummary: batch.validationSummary,
          errorMessage: getValidationErrorMessage(batch.validationSummary),
        },
        cycle: {
          id: batch.cycle.id,
          lpName: batch.cycle.lp.name,
          lpCode: batch.cycle.lp.code,
          storeOrganization: batch.cycle.storeLocation.storeOrganization.name,
          storeLocation: batch.cycle.storeLocation.name,
          periodMonth: batch.cycle.periodMonth,
          status: batch.cycle.status,
        },
        canRetryBatch:
          canManageBatchProcessing &&
          canRetryImportBatch(batch.status),
        timeline: [
          {
            id: "batch-created",
            label: "Batch created",
            description:
              "VendorStream recorded the import batch and linked it to its cycle.",
            occurredAt: batch.createdAt,
            tone: "neutral" as const,
          },
          {
            id: "file-uploaded",
            label: "Source file uploaded",
            description:
              "The original import workbook was stored and attached to this batch.",
            occurredAt: batch.uploadedFile.uploadedAt,
            tone: "neutral" as const,
          },
          {
            id: "processing-complete",
            label: "Processing completed",
            description:
              "Validation and normalization finished for this batch.",
            occurredAt: batch.processedAt,
            tone: "success" as const,
          },
          {
            id: "processing-failed",
            label: "Processing failed",
            description:
              "The batch encountered a failure during validation or downstream processing.",
            occurredAt: batch.failedAt,
            tone: "warning" as const,
          },
        ].filter((item) => item.occurredAt !== null),
      },
    };
  } catch (error) {
    console.error("Failed to load LP import batch details", error);

    return {
      kind: "error",
      message:
        "We could not load this LP import batch right now. Try again shortly or contact VendorStream support if the issue persists.",
    };
  }
}

function ReadyState({
  batch,
  returnTo,
}: {
  batch: Extract<BatchDetailsState, { kind: "ready" }>["batch"];
  returnTo: string;
}) {
  return (
    <div className="space-y-6">
      <BatchStatusPoller status={batch.status} />
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex w-fit items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-cyan-100">
                {batch.shortLabel}
              </div>
              <StatusBadge
                label={formatSourceType(batch.sourceType)}
                className="border-white/10 bg-white/5 text-slate-200"
              />
              <StatusBadge
                label={formatEnumLabel(batch.status)}
                className={getImportBatchStatusBadgeClassName(batch.status)}
              />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl text-white">
                {batch.file.originalFilename}
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-slate-300">
                Full import batch details for {batch.id}. This view is backed by
                real `ImportBatch`, `UploadedFile`, and `ReconciliationCycle`
                data.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow label="Batch ID" value={batch.id} />
            <DetailRow
              label="Uploaded at"
              value={formatDateTime(batch.uploadedAt)}
            />
            <DetailRow
              label="Uploaded by"
              value={
                batch.uploadedBy?.name ||
                batch.uploadedBy?.email ||
                "Unknown uploader"
              }
            />
            <DetailRow
              label="Current batch"
              value={batch.isCurrent ? "Yes" : "No"}
            />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">Actions</CardTitle>
            <CardDescription className="text-sm leading-6 text-slate-300">
              Navigate back to import history or continue into the related
              cycle.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              asChild
              className="bg-white text-slate-950 hover:bg-slate-100"
            >
              <Link href="/lp/uploads">Back to LP uploads</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href={`/lp/cycles/${batch.cycle.id}`}>
                Go to related cycle
              </Link>
            </Button>
            <form action={retryImportBatchProcessingAction}>
              <input type="hidden" name="batchId" value={batch.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <Button
                type="submit"
                variant="outline"
                disabled={!batch.canRetryBatch}
                className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:text-slate-500"
              >
                Reprocess batch
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              disabled
              className="text-slate-300 disabled:text-slate-500"
            >
              Open source file
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">File metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Original file name"
              value={batch.file.originalFilename}
            />
            <DetailRow label="Bucket" value={batch.file.bucket} />
            <DetailRow label="Storage path" value={batch.file.storagePath} />
            <DetailRow
              label="MIME type"
              value={batch.file.mimeType ?? "Not available"}
            />
            <DetailRow
              label="Size"
              value={formatFileSize(batch.file.sizeBytes)}
            />
            <DetailRow
              label="Checksum"
              value={batch.file.checksumSha256 ?? "Not available"}
            />
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">
              Processing summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow
              label="Total rows"
              value={batch.processing.totalRows ?? "Not available"}
            />
            <DetailRow
              label="Valid rows"
              value={batch.processing.validRows ?? "Not available"}
            />
            <DetailRow
              label="Invalid rows"
              value={batch.processing.invalidRows ?? "Not available"}
            />
            <DetailRow
              label="Raw row records"
              value={batch.processing.rawRowCount}
            />
            <DetailRow
              label="Normalized row records"
              value={batch.processing.normalizedRowCount}
            />
            <DetailRow
              label="Processed at"
              value={formatDateTime(batch.processedAt)}
            />
            <DetailRow
              label="Failed at"
              value={formatDateTime(batch.failedAt)}
            />
          </CardContent>
        </Card>
      </div>

      {batch.status === "VALIDATION_FAILED" ||
      batch.status === "PREVALIDATION_FAILED" ? (
        <Card className="border border-red-400/25 bg-red-500/10 shadow-2xl backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white">
              Validation failed
            </CardTitle>
            <CardDescription className="text-sm leading-6 text-red-100/90">
              {batch.validation.errorMessage ??
                "The workbook contains blocking validation errors."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <DetailRow
                label="Total rows"
                value={batch.processing.totalRows ?? "Not available"}
              />
              <DetailRow
                label="Valid rows"
                value={batch.processing.validRows ?? "Not available"}
              />
              <DetailRow
                label="Invalid rows"
                value={batch.processing.invalidRows ?? "Not available"}
              />
            </div>
            <Button
              asChild
              variant="outline"
              className="border-red-200/25 bg-white/5 text-white hover:bg-white/10"
            >
              <Link href={`/api/lp/uploads/${batch.id}/validation-errors`}>
                Download failed-row CSV
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <JsonPanel
          title="Pre-validation errors"
          description="Structured pre-validation feedback captured before deeper normalization or reconciliation steps."
          value={batch.validation.preValidationErrors}
        />
        <JsonPanel
          title="Validation summary"
          description="Structured validation output recorded after row processing and batch checks."
          value={batch.validation.validationSummary}
        />
      </div>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">Related cycle</CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            This import batch is attached to one reconciliation cycle and can be
            traced directly into cycle review.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          <DetailRow
            label="LP"
            value={
              batch.cycle.lpCode
                ? `${batch.cycle.lpName} (${batch.cycle.lpCode})`
                : batch.cycle.lpName
            }
          />
          <DetailRow
            label="Store organization"
            value={batch.cycle.storeOrganization}
          />
          <DetailRow label="Store location" value={batch.cycle.storeLocation} />
          <DetailRow
            label="Period month"
            value={formatMonthLabel(batch.cycle.periodMonth)}
          />
          <DetailRow
            label="Cycle status"
            value={
              <StatusBadge
                label={formatEnumLabel(batch.cycle.status)}
                className={getCycleStatusBadgeClassName(batch.cycle.status)}
              />
            }
          />
          <DetailRow
            label="Cycle details"
            value={
              <Link
                href={`/lp/cycles/${batch.cycle.id}`}
                className="text-cyan-200 hover:text-cyan-100"
              >
                Open cycle details
              </Link>
            }
          />
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-white/6 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl text-white">
            Activity timeline
          </CardTitle>
          <CardDescription className="text-sm leading-6 text-slate-300">
            Key timestamps recorded for this batch lifecycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {batch.timeline.map((event) => (
            <div
              key={event.id}
              className="flex gap-4 rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-4"
            >
              <div className="mt-1">
                <div
                  className={`h-3 w-3 rounded-full ${
                    event.tone === "success"
                      ? "bg-emerald-300"
                      : event.tone === "warning"
                        ? "bg-amber-300"
                        : "bg-cyan-300"
                  }`}
                />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-white">
                  {event.label}
                </div>
                <div className="text-sm leading-6 text-slate-300">
                  {event.description}
                </div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  {formatDateTime(event.occurredAt)}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default async function LpImportBatchDetailsPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const state = await getBatchDetailsState(batchId);

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
        <header className="space-y-3">
          <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-200">
            LP Import Batch Details
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Import batch status and file processing details
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Inspect one LP import batch, review its uploaded source file,
              validation metadata, processing summary, and related cycle
              context.
            </p>
          </div>
        </header>

        {state.kind === "missing" ? (
          <PageErrorState
            variant="missing"
            badgeLabel="Batch not found"
            title="No LP import batch matched this identifier"
            description={
              <>
                The batch ID{" "}
                <span className="font-medium text-white">{state.batchId}</span>{" "}
                is not available in the current LP workspace.
              </>
            }
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/lp/uploads">Back to LP uploads</Link>
              </Button>
            }
          />
        ) : null}
        {state.kind === "forbidden" ? (
          <PageErrorState
            variant="forbidden"
            title="You do not have access to this import batch"
            description="This batch does not belong to an LP context assigned to your account."
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/lp/uploads">Back to LP uploads</Link>
              </Button>
            }
          />
        ) : null}
        {state.kind === "error" ? (
          <PageErrorState
            variant="error"
            badgeLabel="Batch unavailable"
            title="LP import batch details could not be loaded"
            description={state.message}
            actions={
              <Button
                asChild
                className="bg-white text-slate-950 hover:bg-slate-100"
              >
                <Link href="/lp/uploads">Back to LP uploads</Link>
              </Button>
            }
          />
        ) : null}
        {state.kind === "ready" ? (
          <ReadyState batch={state.batch} returnTo={`/lp/uploads/${batchId}`} />
        ) : null}
      </div>
    </main>
  );
}
