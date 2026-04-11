import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  createImportUploadIntent,
} from "@/lib/import-upload-server";
import type {
  CreateImportUploadIntentError,
  CreateImportUploadIntentRequest,
  CreateImportUploadIntentSuccess,
} from "@/lib/import-upload";

function errorResponse(message: string, status: number) {
  return NextResponse.json<CreateImportUploadIntentError>(
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
    const input = (await request.json()) as CreateImportUploadIntentRequest;

    const result = await createImportUploadIntent({
      actor: {
        userId: session.user.id,
        systemRole: session.user.systemRole,
      },
      input,
    });

    return NextResponse.json<CreateImportUploadIntentSuccess>(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create a direct upload URL.";

    const status =
      message === "Authentication is required."
        ? 401
        : message.includes("current access scope") ||
            message.includes("actively assigned")
          ? 403
          : message.includes("required") ||
              message.includes("invalid") ||
              message.includes("supported Excel file") ||
              message.includes("Unsupported file type") ||
              message.includes("File exceeds")
            ? 400
            : 500;

    console.error("[api/uploads/direct/intent] failed", error);
    return errorResponse(message, status);
  }
}
