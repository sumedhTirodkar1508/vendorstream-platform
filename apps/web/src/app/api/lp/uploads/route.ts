import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

type ApiSuccess = {
  ok: true;
  message: string;
  uploadedFileId: string;
  importBatchId: string;
  processingState: "RECEIVED";
};

type ApiError = {
  ok: false;
  error: string;
};

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

function isAcceptedFileName(value: string) {
  const lowerValue = value.toLowerCase();
  return [".xlsx", ".xls", ".xlsm"].some((extension) =>
    lowerValue.endsWith(extension),
  );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const lpId = String(formData.get("lpId") || "").trim();
    const month = String(formData.get("month") || "").trim();
    const file = formData.get("file");

    if (!lpId) {
      return errorResponse("LP context is required.", 400);
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

    return successResponse({
      ok: true,
      message:
        "Upload request accepted. Storage, import batch creation, and background processing will be connected next.",
      uploadedFileId: `upl_${randomUUID()}`,
      importBatchId: `batch_${randomUUID()}`,
      processingState: "RECEIVED",
    });
  } catch (error) {
    console.error("[api/lp/uploads] failed", error);
    return errorResponse("Failed to accept LP upload.", 500);
  }
}
