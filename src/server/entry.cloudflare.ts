import { createApp, type Bindings } from "./app";
import { createDb } from "./db";
import { snapshotAll } from "./reports";

const app = createApp();

export default {
  async fetch(request: Request, env: Bindings & { ASSETS: Fetcher }, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx);
    // Everything else is the SPA, served by Workers static assets.
    return env.ASSETS.fetch(request);
  },

  /** Nightly snapshot for reports. Schedule lives in wrangler.toml [triggers]. */
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(snapshotAll(createDb(env.DATABASE_URL)));
  },
};
