// apps/worker/src/bootstrap/load-env.ts
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function findRepoRoot(startDir: string): string {
  let currentDir = startDir;

  while (true) {
    if (
      fs.existsSync(path.join(currentDir, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(currentDir, ".git"))
    ) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

export function loadWorkerEnv(): string[] {
  // In production, Fly.io/Vercel/etc. should inject env vars directly.
  // Do not load local .env files in production.
  if (process.env.NODE_ENV === "production") {
    return [];
  }

  const repoRoot = findRepoRoot(process.cwd());

  const workerEnvPath = path.join(repoRoot, "apps/worker/.env");

  if (!fs.existsSync(workerEnvPath)) {
    return [];
  }

  const result = dotenv.config({
    path: workerEnvPath,
    override: false,
    quiet: true,
  });

  if (result.error) {
    throw result.error;
  }

  return [path.relative(repoRoot, workerEnvPath)];
}
