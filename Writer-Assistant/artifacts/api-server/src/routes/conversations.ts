import { Router } from "express";
import { db, conversations, messages, insertMessageSchema } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router = Router();

function getUserId(req: any): string {
  return req.auth?.userId || req.headers["x-guest-id"] || "guest";
}

function serializeConversation(c: any) {
  return {
    ...c,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  };
}

function serializeMessage(m: any) {
  return {
    ...m,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  };
}

// GET /api/conversations?documentId=:id
router.get("/", async (req, res) => {
  const documentId = Number(req.query.documentId);
  if (isNaN(documentId)) return res.status(400).json({ error: "documentId query parameter is required" });
  const userId = getUserId(req);
  const result = await db.select()
    .from(conversations)
    .where(and(eq(conversations.documentId, documentId), eq(conversations.userId, userId)))
    .orderBy(desc(conversations.createdAt));
  res.json(result.map(serializeConversation));
});

// POST /api/conversations
router.post("/", async (req, res) => {
  const userId = getUserId(req);
  const { documentId, title } = req.body;
  if (!documentId || isNaN(Number(documentId))) return res.status(400).json({ error: "documentId is required" });
  const convTitle = title || "New Chat";
  const [conv] = await db.insert(conversations).values({
    documentId: Number(documentId),
    userId,
    title: convTitle,
  }).returning();
  res.status(201).json(serializeConversation(conv));
});

// GET /api/conversations/:id
router.get("/:id", async (req, res) => {
  const convId = Number(req.params.id);
  if (isNaN(convId)) return res.status(400).json({ error: "Invalid conversation ID" });
  const userId = getUserId(req);
  const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, convId), eq(conversations.userId, userId)));
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(messages.createdAt);
  res.json({ ...serializeConversation(conv), messages: msgs.map(serializeMessage) });
});

// PATCH /api/conversations/:id
router.patch("/:id", async (req, res) => {
  const convId = Number(req.params.id);
  if (isNaN(convId)) return res.status(400).json({ error: "Invalid conversation ID" });
  const userId = getUserId(req);
  const { title } = req.body;
  if (!title || typeof title !== "string") return res.status(400).json({ error: "title is required" });
  const [conv] = await db.update(conversations).set({ title }).where(and(eq(conversations.id, convId), eq(conversations.userId, userId))).returning();
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  res.json(serializeConversation(conv));
});

// DELETE /api/conversations/:id
router.delete("/:id", async (req, res) => {
  const convId = Number(req.params.id);
  if (isNaN(convId)) return res.status(400).json({ error: "Invalid conversation ID" });
  const userId = getUserId(req);
  const [conv] = await db.delete(conversations).where(and(eq(conversations.id, convId), eq(conversations.userId, userId))).returning();
  if (!conv) return res.status(404).json({ error: "Conversation not found" });
  res.status(204).end();
});

export default router;
