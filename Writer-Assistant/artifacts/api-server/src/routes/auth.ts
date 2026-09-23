import { Router } from "express";
import { db, documentsTable, documentVersionsTable, worldEntitiesTable, conversations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getSignedGuestId } from "../middlewares/identity";

const router = Router();

// POST /api/auth/claim-documents — reassign guest-owned records to the
// authenticated Clerk user. Called from the frontend after sign-in to migrate
// documents created in guest mode to the user's permanent identity.
router.post("/claim-documents", async (req, res) => {
  // In @clerk/express v2, req.auth is an async function, not a plain object.
  const rawAuth = (req as any).auth;
  const auth = typeof rawAuth === "function" ? await rawAuth() : rawAuth;
  const clerkUserId = auth?.userId;
  if (!clerkUserId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const signedGuestId = getSignedGuestId(req);
  const guestId = req.headers["x-guest-id"];
  if (!signedGuestId || typeof guestId !== "string" || guestId !== signedGuestId) {
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
