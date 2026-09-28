import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
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
 */
export function createDb(databaseUrl: string): Db {
  const u = new URL(databaseUrl);
  const usePg = u.searchParams.get("driver") === "pg" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (usePg) {
    u.searchParams.delete("driver");
    // Both drizzle drivers expose the same query API; batch() is emulated below.
    const db = drizzlePg(u.toString(), { schema }) as unknown as Db;
    if (typeof (db as any).batch !== "function") {
      (db as any).batch = async (queries: Array<Promise<unknown>>) => {
        const out = [];
        for (const q of queries) out.push(await q);
        return out;
      };
    }
    return db;
  }
  return drizzleNeon(neon(databaseUrl), { schema });
}

export { schema };
