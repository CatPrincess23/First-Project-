import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import pinoHttp from "pino-http";
import multer from "multer";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Explicitly allowed cross-origin callers (comma-separated env var).
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const isProd = process.env.NODE_ENV === "production";

function isOriginAllowed(origin: string, host: string | undefined): boolean {
  if (allowedOrigins.includes(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  // Same-origin: the SPA and the API share a host (Vercel rewrites), so the
  // request Origin's host matches the request Host. This covers the production
  // domain and every preview deployment URL without per-URL configuration.
  if (host && url.host === host) return true;
  // Localhost dev origins are allowed outside production.
  if (!isProd && url.hostname === "localhost") return true;
  return false;
}

app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;
    // No Origin header (same-origin simple GET, server-to-server) → allow.
    if (!origin) {
      callback(null, { origin: true, credentials: true });
      return;
    }
    // Reflect the Origin when allowed; otherwise omit the CORS headers so the
    // browser blocks the response — without erroring the request (no 500).
    const allowed = isOriginAllowed(origin, req.headers.host);
    callback(null, { origin: allowed ? origin : false, credentials: true });
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

try {
  app.use("/uploads", express.static(path.join(import.meta.dirname, "..", "uploads")));
} catch { /* uploads dir not available */ }

const skipAuth = !process.env.CLERK_SECRET_KEY;

if (skipAuth && process.env.NODE_ENV === "production") {
  throw new Error("CLERK_SECRET_KEY must be set in production");
}

if (!skipAuth) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
}

app.use((req, _res, next) => {
  if (skipAuth && !(req as any).auth) {
    (req as any).auth = { userId: "dev-user" };
  }
  next();
});

app.use("/api", router);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError || err.message?.includes("Only image files")) {
    res.status(400).json({ error: err.message });
  } else {
    logger.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
