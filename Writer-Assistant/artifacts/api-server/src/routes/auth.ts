import crypto from "node:crypto";
import { Router, type Request, type Response, type RequestHandler } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { db, documentsTable, documentVersionsTable, worldEntitiesTable, conversations } from "@workspace/db";
import { eq } from "drizzle-orm";
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

// POST /api/auth/claim-documents — reassign guest-owned records to the
// authenticated Clerk user. Called from the frontend after sign-in to migrate
// documents created in guest mode to the user's permanent identity.
router.post("/claim-documents", async (req, res) => {
  const clerkUserId = (req as any).auth?.userId;
  const authHeader = req.headers["authorization"];
  // Debug: log what we're seeing so we can diagnose the 401
  console.log("[claim-documents]", {
    authUserId: clerkUserId ?? null,
    authObjectType: typeof (req as any).auth,
    authKeys: (req as any).auth ? Object.keys((req as any).auth) : null,
    hasAuthHeader: typeof authHeader === "string" && authHeader.length > 0,
    authHeaderPrefix: typeof authHeader === "string" ? authHeader.slice(0, 20) : null,
    hasGuestId: typeof req.headers["x-guest-id"] === "string",
    clerkSecretSet: !!process.env.CLERK_SECRET_KEY,
  });
  if (!clerkUserId) {
    res.status(401).json({ error: "Not authenticated", debug: { hasAuthHeader: !!authHeader } });
    return;
  }

  const guestId = req.headers["x-guest-id"];
  if (typeof guestId !== "string" || guestId.length === 0) {
    res.json({ claimed: 0 });
    return;
  }

  // Skip if the guest id looks like an `anon:` fallback — those are
  // per-request ephemeral identities that shouldn't be claimed.
  if (guestId.startsWith("anon:")) {
    res.json({ claimed: 0 });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const docResult = await tx
      .update(documentsTable)
      .set({ userId: clerkUserId })
      .where(eq(documentsTable.userId, guestId))
      .returning({ id: documentsTable.id });

    await tx
      .update(documentVersionsTable)
      .set({ userId: clerkUserId })
      .where(eq(documentVersionsTable.userId, guestId));

    await tx
      .update(worldEntitiesTable)
      .set({ userId: clerkUserId })
      .where(eq(worldEntitiesTable.userId, guestId));

    await tx
      .update(conversations)
      .set({ userId: clerkUserId })
      .where(eq(conversations.userId, guestId));

    return { claimed: docResult.length };
  });

  // Clear the guest cookie so subsequent requests don't carry the stale identity.
  res.clearCookie("wa_guest", { path: "/" });

  res.json(result);
});

export default router;
