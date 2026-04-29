import pino from "pino";

export const logger = pino({
  name: "vendorstream-worker",
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "err.stack",
      "process.env.DATABASE_URL",
      "process.env.PG_BOSS_DATABASE_URL",
      "process.env.SUPABASE_SERVICE_ROLE_KEY",
    ],
    remove: true,
  },
});
