import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzleNeon<typeof schema>>;

/**
 * Two drivers, one type:
 *
 * - Neon HTTP (default): works on Cloudflare Workers, Vercel Functions, and Node.
 *   Any Postgres works behind Neon's serverless proxy or Cloudflare Hyperdrive.
 *   No interactive transactions; use db.batch().
 * - node-postgres: chosen when DATABASE_URL has `?driver=pg` or points at
 *   localhost. For local dev, tests, and self-hosting on a Node runtime. Not
 *   available on Cloudflare Workers.
 *
 * createDb is called per request. The Neon client is stateless so that is free.
 * node-postgres needs a Pool, which is cached at module scope per connection
 * string so a long-lived Node process does not open a pool per request.
 */
const pools = new Map<string, Pool>();

export function createDb(databaseUrl: string): Db {
  const u = new URL(databaseUrl);
  const usePg = u.searchParams.get("driver") === "pg" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (!usePg) return drizzleNeon(neon(databaseUrl), { schema });

  u.searchParams.delete("driver");
  const key = u.toString();
  let pool = pools.get(key);
  if (!pool) {
    pool = new Pool({ connectionString: key, max: 10 });
    pools.set(key, pool);
  }
  const db = drizzlePg(pool, { schema }) as unknown as Db;
  if (typeof (db as any).batch !== "function") {
    // Sequential emulation of neon-http's batch(). Not atomic; neither is neon-http's.
    (db as any).batch = async (queries: Array<Promise<unknown>>) => {
      const out = [];
      for (const q of queries) out.push(await q);
      return out;
    };
  }
  return db;
}

/** For tests and graceful shutdown on Node. No-op when no pools were opened. */
export async function closeDbPools() {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}

export { schema };
