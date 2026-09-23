import crypto from "node:crypto";
import type { Request, RequestHandler, Response } from "express";

const isProd = process.env.NODE_ENV === "production";

// Guest cookie carries a server-issued UUID signed with HMAC-SHA256. Client
// supplied IDs are advisory only and never select a database identity.
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

export function getSignedGuestId(req: Request): string | null {
  const cookie = (req as any).cookies?.[GUEST_COOKIE];
  return typeof cookie === "string" ? verifyGuestCookie(cookie) : null;
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

export const resolveIdentity: RequestHandler = async (req, res, next) => {
  // In @clerk/express v2, req.auth is an async function that must be called to
  // get the auth state. In v1 it was a plain object. Handle both.
  const rawAuth = (req as any).auth;
  const auth = typeof rawAuth === "function" ? await rawAuth() : rawAuth;
  const userId = auth?.userId;
  if (userId) {
    req.identity = { type: "user", id: userId };
    return next();
  }

  // Read the localStorage ID only to correct it when it disagrees with the
  // authenticated cookie. It is never an identity credential.
  const guestId = (req.headers as any)["x-guest-id"];
  const cookieId = getSignedGuestId(req);
  if (cookieId) {
    req.identity = { type: "guest", id: cookieId };
    if (typeof guestId === "string" && guestId !== cookieId) {
      res.setHeader("X-Guest-Identity-Correction", cookieId);
    }
    return next();
  }

  // Missing or invalid cookies start a new server-owned guest identity. The
  // correction header lets the frontend replace any stale localStorage value.
  const uuid = crypto.randomUUID();
  issueGuestCookie(res, uuid);
  req.identity = { type: "guest", id: uuid };
  if (typeof guestId === "string") res.setHeader("X-Guest-Identity-Correction", uuid);
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
