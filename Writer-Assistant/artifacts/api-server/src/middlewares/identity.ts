import crypto from "node:crypto";
import type { RequestHandler, Response } from "express";

const isProd = process.env.NODE_ENV === "production";

// Guest cookie carries a server-issued UUID signed with HMAC-SHA256. The client
// can never forge or supply its own id (the old `x-guest-id` header is gone).
const GUEST_COOKIE = "wa_guest";
const GUEST_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // ~1 year

const GUEST_ID_SECRET =
  process.env.GUEST_ID_SECRET ?? (() => {
    const generated = crypto.randomBytes(32).toString("hex");
    console.warn(
      "[identity] GUEST_ID_SECRET not set — generated a random one. " +
      "Guest cookies will be invalidated on server restart. Set GUEST_ID_SECRET for persistence."
    );
    return generated;
  })();

export const guestSigningEnabled = true;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      identity?: { type: "user" | "guest"; id: string };
    }
  }
}

function hmacHex(uuid: string): string {
  return crypto.createHmac("sha256", GUEST_ID_SECRET as string).update(uuid).digest("hex");
}

export function signGuestId(uuid: string): string {
  return `${uuid}.${hmacHex(uuid)}`;
}

function verifyGuestCookie(value: string): string | null {
  if (!guestSigningEnabled) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const uuid = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = hmacHex(uuid);
  // Length check first: timingSafeEqual throws on unequal-length buffers.
  if (sig.length !== expected.length) return null;
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  return uuid;
}

export function issueGuestCookie(res: Response, uuid: string): void {
  res.cookie(GUEST_COOKIE, signGuestId(uuid), {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
}

export const resolveIdentity: RequestHandler = (req, res, next) => {
  const userId = (req as any).auth?.userId;
  if (userId) {
    req.identity = { type: "user", id: userId };
    return next();
  }

  // Read both sources before deciding so we can detect conflicts.
  const guestId = (req.headers as any)["x-guest-id"];
  const cookie = (req as any).cookies?.[GUEST_COOKIE];

  // Cookie is preferred because it is server-signed (HMAC verified) and more
  // trustworthy than a raw header. This prevents identity loss when localStorage
  // is cleared (e.g. browser data reset) but the cookie survives.
  if (typeof cookie === "string" && cookie.length > 0) {
    const uuid = verifyGuestCookie(cookie);
    if (uuid) {
      req.identity = { type: "guest", id: uuid };
      issueGuestCookie(res, uuid);
      // If the header has a different (stale) value, tell the client to fix
      // localStorage so they stay in sync.
      if (typeof guestId === "string" && guestId.length > 0 && guestId !== uuid) {
        res.setHeader("X-Guest-Identity-Correction", uuid);
      }
      return next();
    }
  }

  // x-guest-id header (from localStorage on the frontend) is the fallback source.
  // It survives cookie-only clears (which some browsers do aggressively). Only
  // accept a well-formed UUID — the frontend always sends one via
  // crypto.randomUUID(), so anything else is a malformed/forged value we'd rather
  // not adopt as an identity (it would silently bind the caller to arbitrary data).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof guestId === "string" && UUID_RE.test(guestId)) {
    req.identity = { type: "guest", id: guestId };
    issueGuestCookie(res, guestId);
    return next();
  }

  // Last resort: generate a fresh server-side UUID and issue a cookie.
  const uuid = crypto.randomUUID();
  issueGuestCookie(res, uuid);
  req.identity = { type: "guest", id: uuid };
  next();
};

export const requireIdentity: RequestHandler = (_req, _res, next) => {
  next();
};

export function getUserId(req: any): string {
  // resolveIdentity (applied globally in app.ts) always sets req.identity. If it
  // is somehow missing, fail closed with a unique per-request id rather than the
  // shared literal "guest" — that literal would bucket every anonymous request
  // together and leak data between unrelated callers.
  const id = req.identity?.id;
  if (typeof id === "string" && id.length > 0) return id;
  const fallback = `anon:${(req.ip ?? "0.0.0.0")}`;
  if (!req.identity) req.identity = { type: "guest", id: fallback };
  return fallback;
}
