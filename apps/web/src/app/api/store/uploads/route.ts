import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@vendorstream/database";
import type { ProcessImportBatchPayload } from "@vendorstream/contracts";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  resolveAuthorizedUploadScope,
  getSupabaseServiceRoleClient,
} from "@/lib/import-upload-server";
import { enqueueProcessImportBatchJob } from "@/lib/queue/producer";
import {
  DEFAULT_IMPORT_UPLOAD_BUCKET,
  buildImportUploadStoragePath,
  getCycleStatusForCurrentBatchPresence,
  isAcceptedImportUploadFileName,
  isValidUploadMonth,
  parseUploadMonth,
  MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES,
} from "@/lib/import-upload";

type ApiSuccess = {
  ok: true;
  message: string;
  uploadedFileId: string;
  importBatchId: string;
  cycleId: string;
  processingState: "RECEIVED";
  queue: {
    jobName: string;
    status: "ENQUEUED" | "FAILED" | "SKIPPED";
    jobId: string | null;
    error: string | null;
  };
};

type ApiError = {
  ok: false;
  error: string;
};

const BAD_REQUEST_MESSAGES = new Set([
  "LP selection is required.",
  "Store location selection is required.",
  "A valid reporting month is required.",
  "An Excel file is required.",
  "Unsupported file type.",
  "File exceeds the maximum allowed size.",
]);

function successResponse(payload: ApiSuccess, status = 202) {
  return NextResponse.json<ApiSuccess>(payload, { status });
}

function errorResponse(message: string, status: number) {
  return NextResponse.json<ApiError>(
    {
      ok: false,
      error: message,
    },
    { status },
  );
}

function getErrorStatus(message: string) {
  if (BAD_REQUEST_MESSAGES.has(message)) {
    return 400;
  }

  if (
    message.includes("current access scope") ||
    message.includes("actively assigned")
  ) {
    return 403;
  }

  return 500;
}

async function cleanupStoredUpload(args: {
  bucket: string;
  storagePath: string;
}) {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const removeResult = await supabase.storage
      .from(args.bucket)
      .remove([args.storagePath]);

    if (removeResult.error) {
      console.error(
        "[api/store/uploads] failed to remove orphaned storage object",
        removeResult.error,
      );
    }
  } catch (cleanupError) {
    console.error(
      "[api/store/uploads] cleanup after transaction failure threw",
      cleanupError,
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return errorResponse("Authentication is required.", 401);
  }

  if (!session.user.id) {
    return errorResponse("Authenticated session is missing a user id.", 401);
  }

  try {
    const formData = await request.formData();

    const lpId = String(formData.get("lpId") || "").trim();
    const storeLocationId = String(
      formData.get("storeLocationId") || "",
    ).trim();
    const month = String(formData.get("month") || "").trim();
    const file = formData.get("file");

    if (!lpId) {
      return errorResponse("LP selection is required.", 400);
    }

    if (!storeLocationId) {
      return errorResponse("Store location selection is required.", 400);
    }

    if (!isValidUploadMonth(month)) {
      return errorResponse("A valid reporting month is required.", 400);
    }

    if (!(file instanceof File)) {
      return errorResponse("An Excel file is required.", 400);
    }

    if (!isAcceptedImportUploadFileName(file.name)) {
      return errorResponse("Unsupported file type.", 400);
    }

    if (file.size > MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES) {
      return errorResponse("File exceeds the maximum allowed size.", 400);
    }

    await resolveAuthorizedUploadScope({
      actor: {
        userId: session.user.id,
        systemRole: session.user.systemRole,
      },
      sourceType: "STORE",
      lpId,
      storeLocationId,
      month,
    });

    const periodMonth = parseUploadMonth(month);
    const bucket = DEFAULT_IMPORT_UPLOAD_BUCKET;
    const storagePath = buildImportUploadStoragePath({
      sourceType: "STORE",
      lpId,
      storeLocationId,
      month,
      fileName: file.name,
      uniqueSuffix: randomUUID(),
    });

    const supabase = getSupabaseServiceRoleClient();
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const uploadResult = await supabase.storage
      .from(bucket)
      .upload(storagePath, fileBuffer, {
        contentType:
          file.type ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });

    if (uploadResult.error) {
      return errorResponse("Failed to upload file to storage.", 500);
    }

    const result = await prisma
      .$transaction(async (tx) => {
        const cycle = await tx.reconciliationCycle.upsert({
          where: {
            lpId_storeLocationId_periodMonth: {
              lpId,
              storeLocationId,
              periodMonth,
            },
          },
          update: {},
          create: {
            lpId,
            storeLocationId,
            periodMonth,
            status: "AWAITING_UPLOADS",
          },
        });

        await tx.importBatch.updateMany({
          where: {
            cycleId: cycle.id,
            sourceType: "STORE",
            isCurrent: true,
          },
          data: {
            isCurrent: false,
          },
        });

        const hasCurrentLpBatch =
          (await tx.importBatch.count({
            where: {
              cycleId: cycle.id,
              sourceType: "LP",
              isCurrent: true,
            },
          })) > 0;

        const uploadedFile = await tx.uploadedFile.create({
          data: {
            fileKind: "STORE_UPLOAD",
            bucket,
            storagePath,
            originalFilename: file.name,
            mimeType: file.type || null,
            sizeBytes: BigInt(file.size),
            uploadedByUserId: session.user.id,
          },
        });

        const batch = await tx.importBatch.create({
          data: {
            cycleId: cycle.id,
            uploadedFileId: uploadedFile.id,
            sourceType: "STORE",
            status: "RECEIVED",
            isCurrent: true,
            uploadedByUserId: session.user.id,
          },
        });

        const cycleStatus = getCycleStatusForCurrentBatchPresence({
          hasCurrentLpBatch,
          hasCurrentStoreBatch: true,
        });

        await tx.reconciliationCycle.update({
          where: { id: cycle.id },
          data: { status: cycleStatus },
        });

        return {
          cycleId: cycle.id,
          cycleStatus,
          uploadedFileId: uploadedFile.id,
          importBatchId: batch.id,
        };
      })
      .catch(async (transactionError) => {
        await cleanupStoredUpload({ bucket, storagePath });
        throw transactionError;
      });

    const enqueuePayload: ProcessImportBatchPayload = {
      importBatchId: result.importBatchId,
      cycleId: result.cycleId,
      uploadedFileId: result.uploadedFileId,
      uploadedByUserId: session.user.id,
      sourceType: "STORE",
      lpId,
      storeLocationId,
      periodMonth: month,
    };

    const queue = await enqueueProcessImportBatchJob(enqueuePayload);

    return successResponse({
      ok: true,
      message:
        queue.status === "ENQUEUED"
          ? "Store upload accepted. File stored, records created, and processing job enqueued."
          : "Store upload accepted. File stored and records created, but the processing job could not be queued automatically.",
      uploadedFileId: result.uploadedFileId,
      importBatchId: result.importBatchId,
      cycleId: result.cycleId,
      processingState: "RECEIVED",
      queue: {
        jobName: queue.jobName,
        status: queue.status,
        jobId: queue.jobId,
        error: queue.error,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = getErrorStatus(message);
    console.error("[api/store/uploads] failed", error);
    return errorResponse(
      status === 500 ? "Failed to accept store upload." : message,
      status,
    );
  }
}
