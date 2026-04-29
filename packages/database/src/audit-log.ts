import type { Prisma } from "@prisma/client";

type AuditLogWriter = {
  auditLog: {
    create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown>;
  };
};

export type RecordAuditLogInput = {
  actorType: "USER" | "SYSTEM";
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  cycleId?: string | null;
  batchId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export async function recordAuditLog(
  writer: AuditLogWriter,
  input: RecordAuditLogInput,
): Promise<void> {
  await writer.auditLog.create({
    data: {
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      cycleId: input.cycleId ?? null,
      batchId: input.batchId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}
