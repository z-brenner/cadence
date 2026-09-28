import { createApp, type Bindings } from "./app";

const app = createApp();

export default {
  async fetch(request: Request, env: Bindings & { ASSETS: Fetcher }, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return app.fetch(request, env, ctx);
    // Everything else is the SPA, served by Workers static assets.
    return env.ASSETS.fetch(request);
  },
};
