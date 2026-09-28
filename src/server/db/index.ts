import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

/**
 * Neon's HTTP driver works on Cloudflare Workers, Vercel Functions, and Node.
 * Any Postgres works behind Neon's serverless proxy or Cloudflare Hyperdrive.
 * Note: the HTTP driver has no interactive transactions; use db.batch().
 */
export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export { schema };
