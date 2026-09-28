// Vercel Function entrypoint. vercel.json rewrites /api/* here; the static SPA
// is served from /dist by Vercel's CDN. Vercel's Node runtime accepts a
// web-standard (Request) => Response default export, so no adapter is needed.
import { createApp } from "../src/server/app";

const app = createApp();

const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "",
  APP_NAME: process.env.APP_NAME,
  CRON_SECRET: process.env.CRON_SECRET,
};

export default (req: Request) => app.fetch(req, env);
