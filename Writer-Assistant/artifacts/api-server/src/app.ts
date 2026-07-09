import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import pinoHttp from "pino-http";
import multer from "multer";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { resolveIdentity } from "./middlewares/identity";
import { logger } from "./lib/logger";

const app: Express = express();

// Behind Vercel's single proxy hop. Required so req.ip reflects the real client
// (X-Forwarded-For) for the rate limiters; "1" (not true) avoids the permissive-
// trust-proxy validation error in express-rate-limit.
app.set("trust proxy", 1);

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

// Security headers. CSP is tuned so the Vite-built SPA, Clerk, and the AI
// origins keep working; tighten further only if those integrations change.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: [
          "'self'",
          "https://*.clerk.accounts.dev",
          "https://*.clerk.com",
          "https://openrouter.ai",
          "https://generativelanguage.googleapis.com",
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://*.clerk.accounts.dev",
          "https://*.clerk.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    // Leave COEP off so data:/blob: images and Clerk's cross-origin assets load.
    crossOriginEmbedderPolicy: false,
  }),
);

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
app.use(cookieParser());

try {
  app.use("/uploads", express.static(path.join(import.meta.dirname, "..", "uploads")));
} catch { /* uploads dir not available */ }

const skipAuth = !process.env.CLERK_SECRET_KEY;

// Clerk is optional. When CLERK_SECRET_KEY is unset we run in guest-only mode
// (identity resolved from the signed guest cookie / x-guest-id header). Throwing
// here would take the whole API offline in environments that haven't configured
// Clerk yet, so warn instead and keep serving guest traffic.
if (skipAuth && process.env.NODE_ENV === "production") {
  logger.warn(
    "CLERK_SECRET_KEY not set — running in guest-only mode. Sign-in will not authenticate users until it is configured.",
  );
}

if (!skipAuth) {
  app.use(
    clerkMiddleware({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    }),
  );
}

// Resolve identity (Clerk user, signed guest cookie, or x-guest-id header) before
// the API router so requireIdentity and the AI rate-limiter can key off req.identity.
app.use(resolveIdentity);

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
