import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { finalizeImportUpload } from "@/lib/import-upload-server";
import type {
  FinalizeImportUploadError,
  FinalizeImportUploadRequest,
  FinalizeImportUploadSuccess,
} from "@/lib/import-upload";

function errorResponse(message: string, status: number) {
  return NextResponse.json<FinalizeImportUploadError>(
    {
      ok: false,
      error: message,
    },
    { status },
  );
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
    const body = (await request.json()) as FinalizeImportUploadRequest;

    if (!body.uploadIntentToken?.trim()) {
      return errorResponse("Upload intent token is required.", 400);
    }

    const result = await finalizeImportUpload({
      actor: {
        userId: session.user.id,
        systemRole: session.user.systemRole,
      },
      uploadIntentToken: body.uploadIntentToken,
    });

    const status = result.wasExisting
      ? 200
      : result.queue.status === "ENQUEUED"
        ? 201
        : 202;

    return NextResponse.json<FinalizeImportUploadSuccess>(result, {
      status,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to finalize the upload.";

    const status =
      message === "Authentication is required."
        ? 401
        : message.includes("does not belong") ||
            message.includes("current access scope") ||
            message.includes("actively assigned")
          ? 403
          : message.includes("token") ||
              message.includes("required") ||
              message.includes("verified in storage")
            ? 400
            : 500;

    console.error("[api/uploads/direct/finalize] failed", error);
    return errorResponse(message, status);
  }
}
