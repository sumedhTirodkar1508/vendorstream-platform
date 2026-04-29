import { loadWorkerEnv } from "./bootstrap/load-env.js";

loadWorkerEnv();

const INITIAL_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 60_000;

function getRetryDelay(attempt: number) {
  return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in VendorStream worker", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception in VendorStream worker", error);
});

let attempt = 0;

while (true) {
  try {
    const { startWorker } = await import("./worker.js");
    await startWorker();
    break;
  } catch (error) {
    const retryDelay = getRetryDelay(attempt);
    attempt += 1;

    console.error("Failed to start VendorStream worker; retrying", {
      attempt,
      retryDelayMs: retryDelay,
      error,
    });

    await sleep(retryDelay);
  }
}
