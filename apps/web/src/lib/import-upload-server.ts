import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { JOBS, type ProcessImportBatchPayload } from "@vendorstream/contracts";
import { createClient } from "@supabase/supabase-js";
import { prisma, recordAuditLog, type SystemRole } from "@vendorstream/database";
import { getLpAccessContextForUser } from "@/lib/lp-access-context";
import {
  ACCEPTED_IMPORT_UPLOAD_FILE_EXTENSIONS,
  DEFAULT_IMPORT_UPLOAD_BUCKET,
  MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES,
  buildImportUploadStoragePath,
  getCycleStatusForCurrentBatchPresence,
  getFileKindForSourceType,
  isAcceptedImportUploadFileName,
  isAcceptedImportUploadMimeType,
  isValidUploadMonth,
  parseUploadMonth,
  type CreateImportUploadIntentRequest,
  type CreateImportUploadIntentSuccess,
  type FinalizeImportUploadSuccess,
  type UploadSourceType,
} from "@/lib/import-upload";
import { enqueueProcessImportBatchJob } from "@/lib/queue/producer";
import { getStoreUploadContextForUser } from "@/lib/store-upload-context";

export type UploadActor = {
  userId: string;
  systemRole?: SystemRole;
};

type UploadIntentPayload = {
  v: 1;
  exp: number;
  userId: string;
  sourceType: UploadSourceType;
  lpId: string;
  storeLocationId: string;
  month: string;
  bucket: string;
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string | null;
};

const SIGNED_UPLOAD_INTENT_TTL_MS = 1000 * 60 * 60 * 2;

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }

  return value;
}

function getUploadIntentSecret() {
  return (
    process.env.UPLOAD_INTENT_SECRET?.trim() ||
    getRequiredEnv("NEXTAUTH_SECRET")
  );
}

export function getSupabaseServiceRoleClient() {
  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function encodeUploadIntentToken(payload: UploadIntentPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = createHmac("sha256", getUploadIntentSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function decodeUploadIntentToken(token: string) {
  const [encodedPayload, encodedSignature] = token.split(".");

  if (!encodedPayload || !encodedSignature) {
    throw new Error("Upload intent token is invalid.");
  }

  const expectedSignature = createHmac("sha256", getUploadIntentSecret())
    .update(encodedPayload)
    .digest("base64url");

  const providedBuffer = Buffer.from(encodedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error("Upload intent token could not be verified.");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as UploadIntentPayload;

  if (payload.v !== 1 || payload.exp <= Date.now()) {
    throw new Error("Upload intent token has expired.");
  }

  return payload;
}

function validateIntentInput(input: CreateImportUploadIntentRequest) {
  if (input.sourceType !== "LP" && input.sourceType !== "STORE") {
    throw new Error("Upload source type is invalid.");
  }

  if (!input.lpId.trim()) {
    throw new Error("LP selection is required.");
  }

  if (!input.storeLocationId.trim()) {
    throw new Error("Store location selection is required.");
  }

  if (!isValidUploadMonth(input.month.trim())) {
    throw new Error("A valid reporting month is required.");
  }

  if (!input.fileName.trim()) {
    throw new Error("File name is required.");
  }

  if (!isAcceptedImportUploadFileName(input.fileName)) {
    throw new Error(
      `Upload a supported Excel file: ${ACCEPTED_IMPORT_UPLOAD_FILE_EXTENSIONS.join(", ")}.`,
    );
  }

  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new Error("File size is invalid.");
  }

  if (input.fileSizeBytes > MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES) {
    throw new Error(
      `File exceeds the ${Math.round(
        MAX_IMPORT_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024),
      )} MB limit.`,
    );
  }

  if (!isAcceptedImportUploadMimeType(input.mimeType ?? null)) {
    throw new Error("Unsupported file type.");
  }
}

export async function resolveAuthorizedUploadScope(args: {
  actor: UploadActor;
  sourceType: UploadSourceType;
  lpId: string;
  storeLocationId: string;
  month: string;
}): Promise<void> {
  const periodMonth = parseUploadMonth(args.month);

  const activeAssignment = await prisma.storeLocationLpAssignment.findFirst({
    where: {
      lpId: args.lpId,
      storeLocationId: args.storeLocationId,
      isActive: true,
      AND: [
        {
          OR: [{ startsOn: null }, { startsOn: { lte: periodMonth } }],
        },
        {
          OR: [{ endsOn: null }, { endsOn: { gte: periodMonth } }],
        },
      ],
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
      lp: {
        select: {
          id: true,
          name: true,
        },
      },
      storeLocation: {
        select: {
          id: true,
          name: true,
          storeOrganization: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!activeAssignment?.lp || !activeAssignment.storeLocation) {
    throw new Error(
      "The selected LP and store location are not actively assigned for the requested month.",
    );
  }

  if (args.sourceType === "LP") {
    const lpContext = await getLpAccessContextForUser({
      userId: args.actor.userId,
      systemRole: args.actor.systemRole,
    });

    if (!lpContext.lpIds.includes(args.lpId)) {
      throw new Error(
        "The selected LP is not available in your current access scope.",
      );
    }
  } else {
    const storeContext = await getStoreUploadContextForUser({
      userId: args.actor.userId,
      systemRole: args.actor.systemRole,
    });

    const exactOption = storeContext.options.find(
      (option) =>
        option.lpId === args.lpId &&
        option.storeLocationId === args.storeLocationId,
    );

    if (!exactOption) {
      throw new Error(
        "The selected LP and store location combination is not available in your current access scope.",
      );
    }
  }
}

export async function createImportUploadIntent(args: {
  actor: UploadActor;
  input: CreateImportUploadIntentRequest;
}): Promise<CreateImportUploadIntentSuccess> {
  validateIntentInput(args.input);

  await resolveAuthorizedUploadScope({
    actor: args.actor,
    sourceType: args.input.sourceType,
    lpId: args.input.lpId.trim(),
    storeLocationId: args.input.storeLocationId.trim(),
    month: args.input.month.trim(),
  });

  const bucket = DEFAULT_IMPORT_UPLOAD_BUCKET;
  const storagePath = buildImportUploadStoragePath({
    sourceType: args.input.sourceType,
    lpId: args.input.lpId.trim(),
    storeLocationId: args.input.storeLocationId.trim(),
    month: args.input.month.trim(),
    fileName: args.input.fileName.trim(),
    uniqueSuffix: randomUUID(),
  });

  const supabase = getSupabaseServiceRoleClient();
  const createSignedUploadUrlResult = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storagePath);

  if (createSignedUploadUrlResult.error || !createSignedUploadUrlResult.data) {
    throw new Error(
      createSignedUploadUrlResult.error?.message ||
        "Could not create a direct upload URL.",
    );
  }

  const expiresAt = new Date(Date.now() + SIGNED_UPLOAD_INTENT_TTL_MS);
  const uploadIntentToken = encodeUploadIntentToken({
    v: 1,
    exp: expiresAt.getTime(),
    userId: args.actor.userId,
    sourceType: args.input.sourceType,
    lpId: args.input.lpId.trim(),
    storeLocationId: args.input.storeLocationId.trim(),
    month: args.input.month.trim(),
    bucket,
    storagePath,
    fileName: args.input.fileName.trim(),
    fileSizeBytes: args.input.fileSizeBytes,
    mimeType: args.input.mimeType?.trim() || null,
  });

  return {
    ok: true,
    bucket,
    storagePath,
    signedUrl: createSignedUploadUrlResult.data.signedUrl,
    signedUploadToken: createSignedUploadUrlResult.data.token,
    uploadIntentToken,
    expiresAt: expiresAt.toISOString(),
    sourceType: args.input.sourceType,
    fileName: args.input.fileName.trim(),
    month: args.input.month.trim(),
    lpId: args.input.lpId.trim(),
    storeLocationId: args.input.storeLocationId.trim(),
  };
}

export async function finalizeImportUpload(args: {
  actor: UploadActor;
  uploadIntentToken: string;
}): Promise<FinalizeImportUploadSuccess> {
  const payload = decodeUploadIntentToken(args.uploadIntentToken.trim());

  if (payload.userId !== args.actor.userId) {
    throw new Error("Upload intent does not belong to the current user.");
  }

  await resolveAuthorizedUploadScope({
    actor: args.actor,
    sourceType: payload.sourceType,
    lpId: payload.lpId,
    storeLocationId: payload.storeLocationId,
    month: payload.month,
  });

  const supabase = getSupabaseServiceRoleClient();
  const fileInfoResult = await supabase.storage
    .from(payload.bucket)
    .info(payload.storagePath);

  if (fileInfoResult.error || !fileInfoResult.data) {
    throw new Error(
      "The uploaded file could not be verified in storage. Upload the file again.",
    );
  }

  const periodMonth = parseUploadMonth(payload.month);

  const result = await prisma.$transaction(async (tx) => {
    const existingBatch = await tx.importBatch.findFirst({
      where: {
        uploadedFile: {
          bucket: payload.bucket,
          storagePath: payload.storagePath,
        },
      },
      select: {
        id: true,
        cycleId: true,
        status: true,
        uploadedFileId: true,
        cycle: {
          select: {
            lpId: true,
            storeLocationId: true,
            periodMonth: true,
          },
        },
      },
    });

    if (existingBatch) {
      const cycle = await tx.reconciliationCycle.findUnique({
        where: {
          id: existingBatch.cycleId,
        },
        select: {
          status: true,
        },
      });

      return {
        wasExisting: true,
        cycleId: existingBatch.cycleId,
        cycleStatus: cycle?.status ?? "AWAITING_UPLOADS",
        uploadedFileId: existingBatch.uploadedFileId,
        importBatchId: existingBatch.id,
        lpId: existingBatch.cycle.lpId,
        storeLocationId: existingBatch.cycle.storeLocationId,
        periodMonth: existingBatch.cycle.periodMonth,
      };
    }

    const cycle = await tx.reconciliationCycle.upsert({
      where: {
        lpId_storeLocationId_periodMonth: {
          lpId: payload.lpId,
          storeLocationId: payload.storeLocationId,
          periodMonth,
        },
      },
      update: {
        lastError: null,
        reconciliationPassedAt: null,
        statementReadyAt: null,
      },
      create: {
        lpId: payload.lpId,
        storeLocationId: payload.storeLocationId,
        periodMonth,
        status: "AWAITING_UPLOADS",
      },
      select: {
        id: true,
      },
    });

    if (payload.sourceType !== "LP") {
      await tx.importBatch.updateMany({
        where: {
          cycleId: cycle.id,
          sourceType: payload.sourceType,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });
    }

    const uploadedFile = await tx.uploadedFile.create({
      data: {
        fileKind: getFileKindForSourceType(payload.sourceType),
        bucket: payload.bucket,
        storagePath: payload.storagePath,
        originalFilename: payload.fileName,
        mimeType: fileInfoResult.data.contentType || payload.mimeType || null,
        sizeBytes: BigInt(fileInfoResult.data.size ?? payload.fileSizeBytes),
        uploadedByUserId: args.actor.userId,
      },
      select: {
        id: true,
      },
    });

    const batch = await tx.importBatch.create({
      data: {
        cycleId: cycle.id,
        uploadedFileId: uploadedFile.id,
        sourceType: payload.sourceType,
        status: "RECEIVED",
        isCurrent: payload.sourceType !== "LP",
        uploadedByUserId: args.actor.userId,
      },
      select: {
        id: true,
      },
    });

    await recordAuditLog(tx, {
      actorType: "USER",
      actorUserId: args.actor.userId,
      action: "import_batch.created",
      entityType: "IMPORT_BATCH",
      entityId: batch.id,
      cycleId: cycle.id,
      batchId: batch.id,
      metadata: {
        sourceType: payload.sourceType,
        uploadedFileId: uploadedFile.id,
        originalFilename: payload.fileName,
      },
    });

    await recordAuditLog(tx, {
      actorType: "USER",
      actorUserId: args.actor.userId,
      action: "import_upload.finalized",
      entityType: "UPLOADED_FILE",
      entityId: uploadedFile.id,
      cycleId: cycle.id,
      batchId: batch.id,
      metadata: {
        sourceType: payload.sourceType,
        bucket: payload.bucket,
        storagePath: payload.storagePath,
        originalFilename: payload.fileName,
      },
    });

    const [hasCurrentLpBatch, hasCurrentStoreBatch] = await Promise.all([
      tx.importBatch.count({
        where: {
          cycleId: cycle.id,
          sourceType: "LP",
          isCurrent: true,
        },
      }),
      tx.importBatch.count({
        where: {
          cycleId: cycle.id,
          sourceType: "STORE",
          isCurrent: true,
        },
      }),
    ]);

    const cycleStatus = getCycleStatusForCurrentBatchPresence({
      hasCurrentLpBatch: hasCurrentLpBatch > 0,
      hasCurrentStoreBatch: hasCurrentStoreBatch > 0,
    });

    await tx.reconciliationCycle.update({
      where: {
        id: cycle.id,
      },
      data: {
        status: cycleStatus,
        lastError: null,
        reconciliationPassedAt: null,
        statementReadyAt: null,
      },
    });

    return {
      wasExisting: false,
      cycleId: cycle.id,
      cycleStatus,
      uploadedFileId: uploadedFile.id,
      importBatchId: batch.id,
      lpId: payload.lpId,
      storeLocationId: payload.storeLocationId,
      periodMonth,
    };
  });

  const enqueuePayload: ProcessImportBatchPayload = {
    importBatchId: result.importBatchId,
    cycleId: result.cycleId,
    uploadedFileId: result.uploadedFileId,
    uploadedByUserId: args.actor.userId,
    sourceType: payload.sourceType,
    lpId: result.lpId,
    storeLocationId: result.storeLocationId,
    periodMonth: payload.month,
  };

  const queue = result.wasExisting
    ? {
        status: "SKIPPED" as const,
        jobId: null,
        error:
          "This upload was already finalized, so no duplicate processing job was enqueued.",
        jobName: JOBS.PROCESS_IMPORT_BATCH,
      }
    : await enqueueProcessImportBatchJob(enqueuePayload);

  return {
    ok: true,
    message: result.wasExisting
      ? "This upload was already finalized. Returning the existing VendorStream records."
      : queue.status === "ENQUEUED"
        ? "Upload received. VendorStream queued workbook validation for the worker."
        : "Upload received and VendorStream saved the batch records, but the validation job could not be queued automatically.",
    uploadedFileId: result.uploadedFileId,
    importBatchId: result.importBatchId,
    cycleId: result.cycleId,
    cycleStatus: result.cycleStatus,
    sourceType: payload.sourceType,
    bucket: payload.bucket,
    storagePath: payload.storagePath,
    processingState: "RECEIVED",
    wasExisting: result.wasExisting,
    queue: {
      jobName: queue.jobName,
      status: queue.status,
      jobId: queue.jobId,
      error: queue.error,
    },
  };
}
