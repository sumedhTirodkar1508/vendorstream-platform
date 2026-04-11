"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateImportUploadIntentError,
  CreateImportUploadIntentRequest,
  CreateImportUploadIntentSuccess,
  FinalizeImportUploadError,
  FinalizeImportUploadSuccess,
} from "@/lib/import-upload";

let cachedSupabaseBrowserClient: SupabaseClient | null = null;

function getRequiredPublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required client environment variable: ${name}.`,
    );
  }

  return value;
}

function getSupabaseBrowserClient() {
  if (cachedSupabaseBrowserClient) {
    return cachedSupabaseBrowserClient;
  }

  cachedSupabaseBrowserClient = createClient(
    getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return cachedSupabaseBrowserClient;
}

async function parseJsonResponse<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null;
}

export async function runDirectImportUpload(args: {
  intent: CreateImportUploadIntentRequest;
  file: File;
  onProgressChange?: (value: number) => void;
}) {
  args.onProgressChange?.(10);

  const intentResponse = await fetch("/api/uploads/direct/intent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(args.intent),
  });

  const intentPayload =
    await parseJsonResponse<
      CreateImportUploadIntentSuccess | CreateImportUploadIntentError
    >(intentResponse);

  if (!intentResponse.ok || !intentPayload || intentPayload.ok === false) {
    throw new Error(
      (intentPayload && "error" in intentPayload && intentPayload.error) ||
        "Could not start the direct upload.",
    );
  }

  args.onProgressChange?.(45);

  const supabase = getSupabaseBrowserClient();
  const uploadResult = await supabase.storage
    .from(intentPayload.bucket)
    .uploadToSignedUrl(
      intentPayload.storagePath,
      intentPayload.signedUploadToken,
      args.file,
      {
        contentType: args.file.type || undefined,
      },
    );

  if (uploadResult.error) {
    throw new Error(
      uploadResult.error.message || "Could not upload the file to storage.",
    );
  }

  args.onProgressChange?.(85);

  const finalizeResponse = await fetch("/api/uploads/direct/finalize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      uploadIntentToken: intentPayload.uploadIntentToken,
    }),
  });

  const finalizePayload =
    await parseJsonResponse<
      FinalizeImportUploadSuccess | FinalizeImportUploadError
    >(finalizeResponse);

  if (!finalizeResponse.ok || !finalizePayload || finalizePayload.ok === false) {
    throw new Error(
      (finalizePayload &&
        "error" in finalizePayload &&
        finalizePayload.error) ||
        "Could not finalize the upload.",
    );
  }

  args.onProgressChange?.(100);

  return finalizePayload;
}
