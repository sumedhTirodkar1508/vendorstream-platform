import "server-only";

import { createClient } from "@supabase/supabase-js";
import { prisma, type SystemRole } from "@vendorstream/database";
import { getLpAccessContextForUser } from "@/lib/lp-access-context";
import { getStoreUploadContextForUser } from "@/lib/store-upload-context";

type StatementDownloadResult =
  | {
      kind: "ok";
      signedUrl: string;
    }
  | {
      kind: "unauthenticated" | "forbidden" | "not_found" | "missing_file";
      message: string;
    }
  | {
      kind: "error";
      message: string;
    };

const STATEMENT_DOWNLOAD_EXPIRES_IN_SECONDS = 60 * 10;

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }

  return value;
}

function isAdminRole(role?: SystemRole): boolean {
  return role === "ADMIN";
}

export async function getStatementSignedDownloadUrl(args: {
  statementId: string;
  actor: {
    userId: string;
    systemRole?: SystemRole;
  };
}): Promise<StatementDownloadResult> {
  try {
    if (!args.actor.userId) {
      return {
        kind: "unauthenticated",
        message: "Authentication is required.",
      };
    }

    const statement = await prisma.statement.findUnique({
      where: {
        id: args.statementId,
      },
      select: {
        id: true,
        generatedFile: {
          select: {
            bucket: true,
            storagePath: true,
            originalFilename: true,
          },
        },
        cycle: {
          select: {
            lpId: true,
            storeLocationId: true,
          },
        },
      },
    });

    if (!statement) {
      return {
        kind: "not_found",
        message: "Statement not found.",
      };
    }

    if (!statement.generatedFile) {
      return {
        kind: "missing_file",
        message: "Statement file has not been generated yet.",
      };
    }

    const isAdmin = isAdminRole(args.actor.systemRole);

    const [lpContext, storeContext] = await Promise.all([
      getLpAccessContextForUser({
        userId: args.actor.userId,
        systemRole: args.actor.systemRole,
      }),
      getStoreUploadContextForUser({
        userId: args.actor.userId,
        systemRole: args.actor.systemRole,
      }),
    ]);

    const hasLpAccess = lpContext.lpIds.includes(statement.cycle.lpId);
    const hasStoreAccess = storeContext.options.some(
      (option) =>
        option.lpId === statement.cycle.lpId &&
        option.storeLocationId === statement.cycle.storeLocationId,
    );

    if (!isAdmin && !hasLpAccess && !hasStoreAccess) {
      return {
        kind: "forbidden",
        message: "You are not authorized to download this statement.",
      };
    }

    const supabase = createClient(
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const { data, error } = await supabase.storage
      .from(statement.generatedFile.bucket)
      .createSignedUrl(
        statement.generatedFile.storagePath,
        STATEMENT_DOWNLOAD_EXPIRES_IN_SECONDS,
        {
          download: statement.generatedFile.originalFilename,
        },
      );

    if (error || !data?.signedUrl) {
      return {
        kind: "error",
        message: error?.message || "Could not create a statement download URL.",
      };
    }

    return {
      kind: "ok",
      signedUrl: data.signedUrl,
    };
  } catch (error) {
    return {
      kind: "error",
      message:
        error instanceof Error
          ? error.message
          : "Could not prepare the statement download.",
    };
  }
}
