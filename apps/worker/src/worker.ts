import { PgBoss, type Job } from "pg-boss";

import {
  GenerateStatementSchema,
  JOBS,
  ProcessImportBatchSchema,
  ReconcileCycleSchema,
  type GenerateStatementPayload,
  type ProcessImportBatchPayload,
  type ReconcileCyclePayload,
} from "@vendorstream/contracts";
import { prisma, recordAuditLog } from "@vendorstream/database";

import { createSupabaseStorageAdapter } from "./adapters/supabase-storage.js";
import { getQueueConfig } from "./config.js";
import { logger } from "./logger.js";
import { ImportBatchRepository } from "./repositories/import-batch-repository.js";
import { ReconciliationRepository } from "./repositories/reconciliation-repository.js";
import { StatementRepository } from "./repositories/statement-repository.js";
import { cleanupFailedUploadArtifacts } from "./services/import-batch/cleanup-failed-upload-artifacts.js";
import { processImportBatch } from "./services/import-batch/process-import-batch.js";
import { reconcileCycle } from "./services/reconciliation/reconcile-cycle.js";
import { generateStatement } from "./services/statements/generate-statement.js";

async function enqueueReconcileCycleJob(
  boss: PgBoss,
  payload: ReconcileCyclePayload,
): Promise<void> {
  const jobId = await boss.send(JOBS.RECONCILE_CYCLE, payload, {
    retryLimit: 6,
    retryDelay: 30,
    retryBackoff: true,
    retentionSeconds: 60 * 60 * 24 * 14,
    expireInSeconds: 60 * 30,
  });

  if (!jobId) {
    throw new Error("pg-boss did not return a job id for reconcile-cycle.");
  }

  logger.info(
    {
      cycleId: payload.cycleId,
      jobId,
    },
    "Enqueued reconcile-cycle job",
  );

  await recordAuditLog(prisma, {
    actorType: "SYSTEM",
    action: "reconciliation.enqueued",
    entityType: "RECONCILIATION_CYCLE",
    entityId: payload.cycleId,
    cycleId: payload.cycleId,
    metadata: {
      jobId,
      lpId: payload.lpId,
      storeLocationId: payload.storeLocationId,
      periodMonth: payload.periodMonth,
    },
  });
}

async function enqueueGenerateStatementJob(
  boss: PgBoss,
  payload: GenerateStatementPayload,
): Promise<void> {
  const jobId = await boss.send(JOBS.GENERATE_STATEMENT, payload, {
    retryLimit: 6,
    retryDelay: 30,
    retryBackoff: true,
    retentionSeconds: 60 * 60 * 24 * 14,
    expireInSeconds: 60 * 30,
  });

  if (!jobId) {
    throw new Error("pg-boss did not return a job id for generate-statement.");
  }

  logger.info(
    {
      statementTaskId: payload.statementTaskId,
      cycleId: payload.cycleId,
      jobId,
    },
    "Enqueued generate-statement job",
  );
}

export async function startWorker(): Promise<void> {
  const queueConfig = getQueueConfig();
  const boss = new PgBoss({
    connectionString: queueConfig.connectionString,
    schema: queueConfig.schema,
    application_name: "vendorstream-worker",
    monitorIntervalSeconds: 30,
    maintenanceIntervalSeconds: 120,
    queueCacheIntervalSeconds: 60,
    migrate: true,
    createSchema: true,
  });

  boss.on("error", (error: Error) => {
    logger.error(
      {
        err: error,
      },
      "pg-boss emitted a queue error",
    );
  });

  const repository = new ImportBatchRepository();
  const reconciliationRepository = new ReconciliationRepository();
  const statementRepository = new StatementRepository();
  const storageAdapter = createSupabaseStorageAdapter();

  await boss.start();
  await boss.createQueue(JOBS.PROCESS_IMPORT_BATCH);
  await boss.createQueue(JOBS.RECONCILE_CYCLE);
  await boss.createQueue(JOBS.GENERATE_STATEMENT);
  await boss.createQueue(JOBS.CLEANUP_FAILED_UPLOAD_ARTIFACTS);
  await boss.schedule(JOBS.CLEANUP_FAILED_UPLOAD_ARTIFACTS, "0 3 * * *", null, {
    retryLimit: 3,
    retryDelay: 300,
    retryBackoff: true,
    retentionSeconds: 60 * 60 * 24 * 14,
    expireInSeconds: 60 * 30,
  });

  logger.info(
    {
      queueSchema: queueConfig.schema,
    },
    "VendorStream worker started",
  );

  await boss.work(
    JOBS.PROCESS_IMPORT_BATCH,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs: Job<ProcessImportBatchPayload>[]) => {
      const job = jobs[0];

      if (!job) {
        return;
      }

      const payloadResult = ProcessImportBatchSchema.safeParse(job.data);

      if (!payloadResult.success) {
        logger.error(
          {
            jobId: job.id,
            errors: payloadResult.error.flatten().fieldErrors,
          },
          "Received invalid process-import-batch payload",
        );

        throw new Error("Invalid process-import-batch payload");
      }

      const outcome = await processImportBatch(payloadResult.data, {
        repository,
        storageAdapter,
      });

      if (outcome.reconcileCyclePayload) {
        await enqueueReconcileCycleJob(boss, outcome.reconcileCyclePayload);
      }
    },
  );

  await boss.work(
    JOBS.RECONCILE_CYCLE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs: Job<ReconcileCyclePayload>[]) => {
      const job = jobs[0];

      if (!job) {
        return;
      }

      const payloadResult = ReconcileCycleSchema.safeParse(job.data);

      if (!payloadResult.success) {
        logger.error(
          {
            jobId: job.id,
            errors: payloadResult.error.flatten().fieldErrors,
          },
          "Received invalid reconcile-cycle payload",
        );

        throw new Error("Invalid reconcile-cycle payload");
      }

      const outcome = await reconcileCycle(payloadResult.data, {
        repository: reconciliationRepository,
        statementRepository,
      });

      if (outcome.statementGenerationPayload) {
        await enqueueGenerateStatementJob(
          boss,
          outcome.statementGenerationPayload,
        );
      }
    },
  );

  await boss.work(
    JOBS.GENERATE_STATEMENT,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs: Job<GenerateStatementPayload>[]) => {
      const job = jobs[0];

      if (!job) {
        return;
      }

      const payloadResult = GenerateStatementSchema.safeParse(job.data);

      if (!payloadResult.success) {
        logger.error(
          {
            jobId: job.id,
            errors: payloadResult.error.flatten().fieldErrors,
          },
          "Received invalid generate-statement payload",
        );

        throw new Error("Invalid generate-statement payload");
      }

      await generateStatement(payloadResult.data, {
        repository: statementRepository,
        storageAdapter,
      });
    },
  );

  await boss.work(
    JOBS.CLEANUP_FAILED_UPLOAD_ARTIFACTS,
    { batchSize: 1, pollingIntervalSeconds: 60 },
    async () => {
      const outcome = await cleanupFailedUploadArtifacts({
        repository,
        storageAdapter,
      });

      logger.info(outcome, "Finished failed import upload artifact cleanup");
    },
  );

  const shutdown = async (signal: NodeJS.Signals) => {
    logger.info({ signal }, "Stopping VendorStream worker");
    await boss.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
