"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import {
  retryCycleReconciliation,
  retryImportBatchProcessing,
  retryStatementTaskGeneration,
} from "@/lib/processing-retry-server";

function normalizeReturnTo(value: FormDataEntryValue | null, fallback: string) {
  const normalized = String(value ?? "").trim();

  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }

  return fallback;
}

function getPathname(value: string) {
  const [pathname] = value.split("?");
  return pathname || "/";
}

export async function retryImportBatchProcessingAction(formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const batchId = String(formData.get("batchId") ?? "").trim();
  const returnTo = normalizeReturnTo(formData.get("returnTo"), "/lp/uploads");

  if (!batchId || !session.user.id) {
    redirect(returnTo);
  }

  const result = await retryImportBatchProcessing({
    importBatchId: batchId,
    actor: {
      userId: session.user.id,
      systemRole: session.user.systemRole,
    },
  });

  if (result.status === "ENQUEUED") {
    revalidatePath("/lp/uploads");
    revalidatePath(`/lp/uploads/${batchId}`);

    if (result.cycleId) {
      revalidatePath("/lp/cycles");
      revalidatePath(`/lp/cycles/${result.cycleId}`);
    }

    revalidatePath("/admin/processing");
  }

  revalidatePath(getPathname(returnTo));
  redirect(returnTo);
}

export async function retryCycleReconciliationAction(formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const cycleId = String(formData.get("cycleId") ?? "").trim();
  const returnTo = normalizeReturnTo(formData.get("returnTo"), "/lp/cycles");

  if (!cycleId || !session.user.id) {
    redirect(returnTo);
  }

  const result = await retryCycleReconciliation({
    cycleId,
    actor: {
      userId: session.user.id,
      systemRole: session.user.systemRole,
    },
  });

  if (result.status === "ENQUEUED") {
    revalidatePath("/lp/cycles");
    revalidatePath(`/lp/cycles/${cycleId}`);
    revalidatePath("/admin/processing");
  }

  revalidatePath(getPathname(returnTo));
  redirect(returnTo);
}

export async function retryStatementTaskAction(formData: FormData) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const statementTaskId = String(formData.get("statementTaskId") ?? "").trim();
  const returnTo = normalizeReturnTo(
    formData.get("returnTo"),
    "/admin/statements/tasks",
  );

  if (!statementTaskId || !session.user.id) {
    redirect(returnTo);
  }

  const result = await retryStatementTaskGeneration({
    statementTaskId,
    actor: {
      userId: session.user.id,
      systemRole: session.user.systemRole,
    },
  });

  if (result.status === "ENQUEUED") {
    revalidatePath("/admin/statements/tasks");
    revalidatePath("/admin/processing");

    if (result.cycleId) {
      revalidatePath(`/lp/cycles/${result.cycleId}`);
    }
  }

  revalidatePath(getPathname(returnTo));
  redirect(returnTo);
}
