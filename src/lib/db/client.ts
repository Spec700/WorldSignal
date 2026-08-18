import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/lib/db/schema";

type PrioritySignalsDatabase = NodePgDatabase<typeof schema>;

const globalDatabase = globalThis as typeof globalThis & {
  prioritySignalsDatabase?: PrioritySignalsDatabase;
  prioritySignalsPool?: Pool;
};

export function getDatabase(): PrioritySignalsDatabase {
  if (globalDatabase.prioritySignalsDatabase) {
    return globalDatabase.prioritySignalsDatabase;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required to use CredSignal persistence. Start PostgreSQL and configure the local environment.",
    );
  }

  const pool = new Pool({
    connectionString,
    max: 10,
  });
  const database = drizzle(pool, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalDatabase.prioritySignalsPool = pool;
    globalDatabase.prioritySignalsDatabase = database;
  }

  return database;
}

export async function closeDatabase(): Promise<void> {
  if (globalDatabase.prioritySignalsPool) {
    await globalDatabase.prioritySignalsPool.end();
    globalDatabase.prioritySignalsPool = undefined;
    globalDatabase.prioritySignalsDatabase = undefined;
  }
}
