import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { Db } from "./db";
import * as schema from "./db/schema";

export type AuthEnv = {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
};

/**
 * Auth is created per request because Workers have no process-level state.
 * Better Auth is cheap to construct; the cost is the DB round trip, not this.
 */
export function createAuth(db: Db, env: AuthEnv) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    // Add social providers here when wanted:
    // socialProviders: { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } },
    plugins: [organization()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
