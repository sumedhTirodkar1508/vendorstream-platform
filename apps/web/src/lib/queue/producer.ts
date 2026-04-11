import "server-only";

import { PgBoss } from "pg-boss";
import {
  JOBS,
  ProcessImportBatchSchema,
  type ProcessImportBatchPayload,
} from "@vendorstream/contracts";

type QueueEnqueueResult =
  | {
      status: "ENQUEUED";
      jobId: string;
      error: null;
      jobName: typeof JOBS.PROCESS_IMPORT_BATCH;
    }
  | {
      status: "FAILED" | "SKIPPED";
      jobId: null;
      error: string;
      jobName: typeof JOBS.PROCESS_IMPORT_BATCH;
    };

const globalForPgBoss = globalThis as unknown as {
  vendorStreamPgBoss?: Promise<PgBoss | null>;
  vendorStreamPgBossShutdownRegistered?: boolean;
};

function getQueueConnectionString() {
  return (
    process.env.PG_BOSS_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    ""
  );
}

function getQueueSchema() {
  return process.env.PG_BOSS_SCHEMA?.trim() || "pgboss";
}

function isQueueEnabled() {
  return process.env.PG_BOSS_ENABLED?.trim()?.toLowerCase() !== "false";
}

async function createProducer() {
  const connectionString = getQueueConnectionString();

  if (!isQueueEnabled()) {
    return null;
  }

  if (!connectionString) {
    throw new Error(
      "Queue enqueueing is enabled but no database connection string is configured.",
    );
  }

  const boss = new PgBoss({
    connectionString,
    schema: getQueueSchema(),
    application_name: "vendorstream-web-queue-producer",
    max: 1,
    connectionTimeoutMillis: 5000,
    schedule: false,
    supervise: false,
    monitorIntervalSeconds: 600,
    maintenanceIntervalSeconds: 600,
    queueCacheIntervalSeconds: 600,
    migrate: true,
    createSchema: true,
  });

  boss.on("error", (error: Error) => {
    console.error("[queue/producer] pg-boss error", error);
  });

  await boss.start();
  await boss.createQueue(JOBS.PROCESS_IMPORT_BATCH);

  if (!globalForPgBoss.vendorStreamPgBossShutdownRegistered) {
    globalForPgBoss.vendorStreamPgBossShutdownRegistered = true;

    const shutdown = async () => {
      try {
        const producer = await globalForPgBoss.vendorStreamPgBoss;
        await producer?.stop({
          close: true,
          graceful: false,
          timeout: 1000,
        });
      } catch (error) {
        console.error("[queue/producer] failed to stop pg-boss cleanly", error);
      }
    };

    process.once("SIGTERM", () => {
      void shutdown();
    });
    process.once("SIGINT", () => {
      void shutdown();
    });
    process.once("beforeExit", () => {
      void shutdown();
    });
  }

  return boss;
}

async function getProducer() {
  if (!globalForPgBoss.vendorStreamPgBoss) {
    globalForPgBoss.vendorStreamPgBoss = createProducer().catch((error) => {
      globalForPgBoss.vendorStreamPgBoss = undefined;
      throw error;
    });
  }

  return globalForPgBoss.vendorStreamPgBoss;
}

export async function enqueueProcessImportBatchJob(
  payload: ProcessImportBatchPayload,
): Promise<QueueEnqueueResult> {
  const parsedPayload = ProcessImportBatchSchema.parse(payload);

  if (!isQueueEnabled()) {
    return {
      status: "SKIPPED",
      jobId: null,
      error: "Queue enqueueing is disabled via PG_BOSS_ENABLED=false.",
      jobName: JOBS.PROCESS_IMPORT_BATCH,
    };
  }

  try {
    const boss = await getProducer();

    if (!boss) {
      return {
        status: "SKIPPED",
        jobId: null,
        error: "Queue producer is not available.",
        jobName: JOBS.PROCESS_IMPORT_BATCH,
      };
    }

    const jobId = await boss.send(JOBS.PROCESS_IMPORT_BATCH, parsedPayload, {
      retryLimit: 8,
      retryDelay: 30,
      retryBackoff: true,
      retentionSeconds: 60 * 60 * 24 * 14,
      expireInSeconds: 60 * 60,
    });

    if (!jobId) {
      return {
        status: "FAILED",
        jobId: null,
        error: "pg-boss did not return a job id for the import batch enqueue request.",
        jobName: JOBS.PROCESS_IMPORT_BATCH,
      };
    }

    return {
      status: "ENQUEUED",
      jobId,
      error: null,
      jobName: JOBS.PROCESS_IMPORT_BATCH,
    };
  } catch (error) {
    return {
      status: "FAILED",
      jobId: null,
      error:
        error instanceof Error
          ? error.message
          : "The import batch job could not be enqueued.",
      jobName: JOBS.PROCESS_IMPORT_BATCH,
    };
  }
}
