import { neon, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  return drizzle(neon(url), { schema });
}

let transactionPool: Pool | undefined;

/** WebSocket pool for a read-then-decide-then-write transaction. */
export function getTransactionalDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!transactionPool) {
    transactionPool = new Pool({ connectionString: url, max: 1 });
  }

  return drizzleWs(transactionPool, { schema });
}
