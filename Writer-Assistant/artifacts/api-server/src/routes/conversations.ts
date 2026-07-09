import { Router } from "express";
import { db, conversations, messages, documentsTable, insertMessageSchema } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getUserId } from "../middlewares/identity";

const router = Router();

function serializeConversation(c: any) {
  return {
    id: c.id,
    documentId: c.documentId,
    title: c.title,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  };
}

function serializeMessage(m: any) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt,
  };
}

// GET /api/conversations?documentId=:id
router.get("/", async (req, res) => {
  const documentId = Number(req.query.documentId);
  if (isNaN(documentId)) { res.status(400).json({ error: "documentId query parameter is required" }); return; }
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
  if (!documentId || isNaN(Number(documentId))) { res.status(400).json({ error: "documentId is required" }); return; }
  const docId = Number(documentId);
  // Verify the document belongs to the caller before creating a conversation
  // for it, otherwise any client could attach conversations to other users' docs.
  const [doc] = await db.select().from(documentsTable).where(and(eq(documentsTable.id, docId), eq(documentsTable.userId, userId)));
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  const convTitle = title || "New Chat";
  const [conv] = await db.insert(conversations).values({
    documentId: docId,
    userId,
    title: convTitle,
  }).returning();
  res.status(201).json(serializeConversation(conv));
});

// GET /api/conversations/:id
router.get("/:id", async (req, res) => {
  const convId = Number(req.params.id);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid conversation ID" }); return; }
  const userId = getUserId(req);
  const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, convId), eq(conversations.userId, userId)));
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, convId)).orderBy(messages.createdAt);
  res.json({ ...serializeConversation(conv), messages: msgs.map(serializeMessage) });
});

// PATCH /api/conversations/:id
router.patch("/:id", async (req, res) => {
  const convId = Number(req.params.id);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid conversation ID" }); return; }
  const userId = getUserId(req);
  const { title } = req.body;
  if (!title || typeof title !== "string") { res.status(400).json({ error: "title is required" }); return; }
  const [conv] = await db.update(conversations).set({ title }).where(and(eq(conversations.id, convId), eq(conversations.userId, userId))).returning();
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.json(serializeConversation(conv));
});

// DELETE /api/conversations/:id
router.delete("/:id", async (req, res) => {
  const convId = Number(req.params.id);
  if (isNaN(convId)) { res.status(400).json({ error: "Invalid conversation ID" }); return; }
  const userId = getUserId(req);
  const [conv] = await db.delete(conversations).where(and(eq(conversations.id, convId), eq(conversations.userId, userId))).returning();
  if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
  res.status(204).end();
});

export default router;
