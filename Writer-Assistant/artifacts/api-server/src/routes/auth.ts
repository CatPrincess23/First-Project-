import crypto from "node:crypto";
import { Router, type Request, type Response, type RequestHandler } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { issueGuestCookie, guestSigningEnabled } from "../middlewares/identity";

const router = Router();

// Per-IP cap on guest issuance. Uses the ipKeyGenerator helper so IPv6 clients
// are bucketed by subnet rather than each address counting separately.
const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request, _res: Response) => ipKeyGenerator(req.ip ?? "", 56),
});

// Cheap bot filter applied before issuance: reject missing/empty UAs and the
// obvious scripted clients. A normal browser under the rate limit passes.
const BOT_UA = /bot|crawl|spider|curl|wget|python-requests|axios|headless/i;
const botFilter: RequestHandler = (req, res, next) => {
  const ua = req.headers["user-agent"];
  if (!ua || ua.trim() === "" || BOT_UA.test(ua)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};

// POST /api/auth/guest — mint a fresh server-side guest id and set the signed
// cookie. The client never supplies its own id.
router.post("/guest", guestLimiter, botFilter, (_req, res) => {
  if (!guestSigningEnabled) {
    res.status(503).json({ error: "Guest sign-in is currently unavailable" });
    return;
  }
  const uuid = crypto.randomUUID();
  issueGuestCookie(res, uuid);
  res.json({ ok: true });
});

export default router;
