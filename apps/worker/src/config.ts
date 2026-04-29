type QueueConfig = {
  connectionString: string;
  schema: string;
};

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getQueueConfig(): QueueConfig {
  return {
    connectionString:
      process.env.PG_BOSS_DATABASE_URL ?? requireEnv("DATABASE_URL"),
    schema: process.env.PG_BOSS_SCHEMA ?? "pgboss",
  };
}

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
