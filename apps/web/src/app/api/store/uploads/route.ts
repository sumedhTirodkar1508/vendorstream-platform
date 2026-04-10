import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@vendorstream/database";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { getStoreUploadContextForUser } from "@/lib/store-upload-context";

type ApiSuccess = {
  ok: true;
  message: string;
  uploadedFileId: string;
  importBatchId: string;
  cycleId: string;
  processingState: "RECEIVED";
};

type ApiError = {
  ok: false;
  error: string;
};

const ACCEPTED_FILE_EXTENSIONS = [".xlsx", ".xls", ".xlsm"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

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

function isValidMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function parseMonth(value: string) {
  const [year, month] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function isAcceptedFileName(value: string) {
  const lowerValue = value.toLowerCase();
  return ACCEPTED_FILE_EXTENSIONS.some((extension) =>
    lowerValue.endsWith(extension),
  );
}

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
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
    const storeLocationId = String(formData.get("storeLocationId") || "").trim();
    const month = String(formData.get("month") || "").trim();
    const file = formData.get("file");

    if (!lpId) {
      return errorResponse("LP selection is required.", 400);
    }

    if (!storeLocationId) {
      return errorResponse("Store location selection is required.", 400);
    }

    if (!isValidMonth(month)) {
      return errorResponse("A valid reporting month is required.", 400);
    }

    if (!(file instanceof File)) {
      return errorResponse("An Excel file is required.", 400);
    }

    if (!isAcceptedFileName(file.name)) {
      return errorResponse("Unsupported file type.", 400);
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return errorResponse("File exceeds the maximum allowed size.", 400);
    }

    const uploadContext = await getStoreUploadContextForUser({
      userId: session.user.id,
      systemRole: session.user.systemRole,
    });

    const authorizedOption =
      uploadContext.options.find(
        (option) =>
          option.lpId === lpId && option.storeLocationId === storeLocationId,
      ) ?? null;

    if (!authorizedOption) {
      return errorResponse(
        "The selected LP and store location combination is not available in your current access scope.",
        403,
      );
    }

    const periodMonth = parseMonth(month);

    const result = await prisma.$transaction(async (tx) => {
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
          bucket: "pending-store-uploads",
          storagePath: `pending/store/${cycle.id}/${randomUUID()}-${sanitizeFileName(file.name)}`,
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

      await tx.reconciliationCycle.update({
        where: { id: cycle.id },
        data: {
          status: hasCurrentLpBatch
            ? "READY_FOR_RECONCILIATION"
            : "AWAITING_UPLOADS",
        },
      });

      return {
        cycleId: cycle.id,
        uploadedFileId: uploadedFile.id,
        importBatchId: batch.id,
      };
    });

    return successResponse({
      ok: true,
      message:
        "Store upload accepted. VendorStream created the cycle linkage, uploaded file record, and current import batch. TODO: persist file bytes to storage and trigger background parsing next.",
      uploadedFileId: result.uploadedFileId,
      importBatchId: result.importBatchId,
      cycleId: result.cycleId,
      processingState: "RECEIVED",
    });
  } catch (error) {
    console.error("[api/store/uploads] failed", error);
    return errorResponse("Failed to accept store upload.", 500);
  }
}
