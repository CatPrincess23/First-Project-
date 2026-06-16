import { Router } from "express";
import { db, documentsTable, documentVersionsTable, conversations } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getUserId } from "../middlewares/identity";
import {
  CreateDocumentBody,
  UpdateDocumentBody,
  GetDocumentParams,
  UpdateDocumentParams,
  DeleteDocumentParams,
  ListDocumentVersionsParams,
  CreateDocumentVersionParams,
  CreateDocumentVersionBody,
} from "@workspace/api-zod";

const router = Router();

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function toIso(value: any) {
  return value instanceof Date ? value.toISOString() : value;
}

// Explicitly project document rows so the internal userId column never leaks to clients.
function serializeDoc(d: any) {
  return {
    id: d.id,
    title: d.title,
    content: d.content,
    wordCount: d.wordCount,
    goalWordCount: d.goalWordCount,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  };
}

// Explicitly project version rows so the internal userId column never leaks to clients.
function serializeVersion(v: any) {
  return {
    id: v.id,
    documentId: v.documentId,
    title: v.title,
    content: v.content,
    wordCount: v.wordCount,
    label: v.label,
    createdAt: toIso(v.createdAt),
  };
}

// GET /api/documents/stats — must be before /:id
router.get("/stats", async (req, res) => {
  const userId = getUserId(req);
  const allDocs = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.userId, userId))
    .orderBy(desc(documentsTable.updatedAt));

  const totalWords = allDocs.reduce((acc, d) => acc + d.wordCount, 0);
  res.json({ totalDocuments: allDocs.length, totalWords, recentDocuments: allDocs.slice(0, 5).map(serializeDoc) });
});

// GET /api/documents
router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const docs = await db.select().from(documentsTable).where(eq(documentsTable.userId, userId)).orderBy(desc(documentsTable.updatedAt));
  res.json(docs.map(serializeDoc));
});

// POST /api/documents
router.post("/", async (req, res) => {
  const parse = CreateDocumentBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input" });
  const userId = getUserId(req);
  const { title, content = "" } = parse.data;
  const [doc] = await db.insert(documentsTable).values({ title, content, userId, wordCount: countWords(content) }).returning();
  res.status(201).json(serializeDoc(doc));
});

// GET /api/documents/:id/versions — must be before /:id
router.get("/:id/versions", async (req, res) => {
  const parse = ListDocumentVersionsParams.safeParse({ id: Number(req.params.id) });
  if (!parse.success) return res.status(400).json({ error: "Invalid ID" });
  const userId = getUserId(req);
  const versions = await db.select().from(documentVersionsTable)
    .where(and(eq(documentVersionsTable.documentId, parse.data.id), eq(documentVersionsTable.userId, userId)))
    .orderBy(desc(documentVersionsTable.createdAt));
  res.json(versions.map(serializeVersion));
});

// POST /api/documents/:id/versions
router.post("/:id/versions", async (req, res) => {
  const paramParse = CreateDocumentVersionParams.safeParse({ id: Number(req.params.id) });
  if (!paramParse.success) return res.status(400).json({ error: "Invalid ID" });
  const bodyParse = CreateDocumentVersionBody.safeParse(req.body);
  if (!bodyParse.success) return res.status(400).json({ error: "Invalid input" });
  const userId = getUserId(req);
  // Only the owner of the parent document may add versions to it.
  const [parent] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, paramParse.data.id), eq(documentsTable.userId, userId)));
  if (!parent) return res.status(404).json({ error: "Not found" });
  const { title, content, wordCount, label } = bodyParse.data;
  const [version] = await db.insert(documentVersionsTable)
    .values({ documentId: paramParse.data.id, userId, title, content, wordCount: wordCount ?? 0, label: label ?? null })
    .returning();
  res.status(201).json(serializeVersion(version));
});

// GET /api/documents/:id
router.get("/:id", async (req, res) => {
  const parse = GetDocumentParams.safeParse({ id: Number(req.params.id) });
  if (!parse.success) return res.status(400).json({ error: "Invalid ID" });
  const userId = getUserId(req);
  const [doc] = await db.select().from(documentsTable).where(and(eq(documentsTable.id, parse.data.id), eq(documentsTable.userId, userId)));
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(serializeDoc(doc));
});

// PATCH /api/documents/:id
router.patch("/:id", async (req, res) => {
  const paramParse = UpdateDocumentParams.safeParse({ id: Number(req.params.id) });
  if (!paramParse.success) return res.status(400).json({ error: "Invalid ID" });
  const bodyParse = UpdateDocumentBody.safeParse(req.body);
  if (!bodyParse.success) return res.status(400).json({ error: "Invalid input" });
  const userId = getUserId(req);
  const { title, content, goalWordCount } = bodyParse.data as any;
  const updates: any = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (content !== undefined) { updates.content = content; updates.wordCount = countWords(content); }
  if (goalWordCount !== undefined) updates.goalWordCount = goalWordCount;
  const [doc] = await db.update(documentsTable).set(updates).where(and(eq(documentsTable.id, paramParse.data.id), eq(documentsTable.userId, userId))).returning();
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(serializeDoc(doc));
});

// DELETE /api/documents/:id
router.delete("/:id", async (req, res) => {
  const parse = DeleteDocumentParams.safeParse({ id: Number(req.params.id) });
  if (!parse.success) return res.status(400).json({ error: "Invalid ID" });
  const userId = getUserId(req);
  // Confirm ownership before destroying anything so a caller can't wipe another
  // user's conversations by guessing a document id they don't own.
  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, parse.data.id), eq(documentsTable.userId, userId)));
  if (!doc) return res.status(404).json({ error: "Not found" });
  // conversations.documentId has no FK cascade, so delete them first (messages cascade via FK),
  // scoped by both documentId and userId. (messages cascade via FK on conversationId)
  await db.delete(conversations).where(and(eq(conversations.documentId, parse.data.id), eq(conversations.userId, userId)));
  await db.delete(documentsTable).where(and(eq(documentsTable.id, parse.data.id), eq(documentsTable.userId, userId)));
  res.status(204).send();
});

export default router;
