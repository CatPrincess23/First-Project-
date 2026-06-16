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

export const resolveIdentity: RequestHandler = (req, _res, next) => {
  const userId = (req as any).auth?.userId;
  if (userId) {
    req.identity = { type: "user", id: userId };
    return next();
  }

  const cookie = (req as any).cookies?.[GUEST_COOKIE];
  if (typeof cookie === "string" && cookie.length > 0) {
    const uuid = verifyGuestCookie(cookie);
    if (uuid) {
      req.identity = { type: "guest", id: uuid };
    }
  }

  next();
};

export const requireIdentity: RequestHandler = (req, res, next) => {
  if (!req.identity) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
};

export function getUserId(req: any): string {
  return req.identity?.id ?? "guest";
}
