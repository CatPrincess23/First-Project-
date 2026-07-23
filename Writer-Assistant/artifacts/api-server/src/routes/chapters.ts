import { Router } from "express";
import { db, documentsTable, chaptersTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { getUserId } from "../middlewares/identity";

const router = Router();

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, c) => String.fromCharCode(parseInt(c, 16)));
}

function countWords(text: string): number {
  const stripped = decodeEntities(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped ? stripped.split(/\s+/).length : 0;
}

function toIso(value: any) {
  return value instanceof Date ? value.toISOString() : value;
}

// Explicitly project chapter rows so the internal userId column never leaks.
function serializeChapter(c: any) {
  return {
    id: c.id,
    documentId: c.documentId,
    title: c.title,
    content: c.content,
    position: c.position,
    wordCount: c.wordCount,
    createdAt: toIso(c.createdAt),
    updatedAt: toIso(c.updatedAt),
  };
}

function isPositiveInt(v: any): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isNonNegInt(v: any): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

// GET /api/documents/:documentId/chapters
router.get("/documents/:documentId/chapters", async (req, res) => {
  const documentId = Number(req.params.documentId);
  if (!isPositiveInt(documentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = getUserId(req);
  // Verify ownership of the parent document.
  const [parent] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId)));
  if (!parent) { res.status(404).json({ error: "Not found" }); return; }
  const rows = await db.select().from(chaptersTable)
    .where(eq(chaptersTable.documentId, documentId))
    .orderBy(asc(chaptersTable.position), asc(chaptersTable.id));
  res.json(rows.map(serializeChapter));
});

// POST /api/documents/:documentId/chapters
router.post("/documents/:documentId/chapters", async (req, res) => {
  const documentId = Number(req.params.documentId);
  if (!isPositiveInt(documentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = getUserId(req);
  const [parent] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId)));
  if (!parent) { res.status(404).json({ error: "Not found" }); return; }

  const body = (req.body ?? {}) as any;
  const title = typeof body.title === "string" && body.title.trim() ? body.title : "Untitled Chapter";
  const content = typeof body.content === "string" ? body.content : "";

  // Next position = current max position + 1 (or count).
  const existing = await db.select().from(chaptersTable).where(eq(chaptersTable.documentId, documentId));
  const nextPos = existing.reduce((acc, c) => Math.max(acc, c.position), -1) + 1;

  const [chapter] = await db.insert(chaptersTable).values({
    documentId, userId, title, content, position: nextPos, wordCount: countWords(content),
  }).returning();
  res.status(201).json(serializeChapter(chapter));
});

// PATCH /api/documents/:documentId/chapters/reorder  { order: [chapterId, ...] }
router.patch("/documents/:documentId/chapters/reorder", async (req, res) => {
  const documentId = Number(req.params.documentId);
  if (!isPositiveInt(documentId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = getUserId(req);
  const [parent] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, documentId), eq(documentsTable.userId, userId)));
  if (!parent) { res.status(404).json({ error: "Not found" }); return; }
  const order = (req.body?.order ?? []) as any[];
  if (!Array.isArray(order) || !order.every(isPositiveInt)) {
    res.status(400).json({ error: "Invalid input" }); return;
  }
  // Verify all ids belong to this document for this user.
  const rows = await db.select().from(chaptersTable)
    .where(and(eq(chaptersTable.documentId, documentId), eq(chaptersTable.userId, userId)));
  const owned = new Set(rows.map(r => r.id));
  if (!order.every(id => owned.has(id))) { res.status(400).json({ error: "Invalid input" }); return; }

  for (let i = 0; i < order.length; i++) {
    await db.update(chaptersTable).set({ position: i, updatedAt: new Date() })
      .where(and(eq(chaptersTable.id, order[i]), eq(chaptersTable.documentId, documentId)));
  }
  res.status(204).send();
});

// PATCH /api/chapters/:id
router.patch("/chapters/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isPositiveInt(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = getUserId(req);
  const [chapter] = await db.select().from(chaptersTable)
    .where(and(eq(chaptersTable.id, id), eq(chaptersTable.userId, userId)));
  if (!chapter) { res.status(404).json({ error: "Not found" }); return; }

  const body = (req.body ?? {}) as any;
  const updates: any = { updatedAt: new Date() };
  if (typeof body.title === "string" && body.title.trim()) updates.title = body.title;
  if (typeof body.content === "string") { updates.content = body.content; updates.wordCount = countWords(body.content); }
  if (typeof body.position === "number" && isNonNegInt(body.position)) updates.position = body.position;

  const [updated] = await db.update(chaptersTable).set(updates)
    .where(and(eq(chaptersTable.id, id), eq(chaptersTable.userId, userId))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeChapter(updated));
});

// DELETE /api/chapters/:id
router.delete("/chapters/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!isPositiveInt(id)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = getUserId(req);
  const [chapter] = await db.select().from(chaptersTable)
    .where(and(eq(chaptersTable.id, id), eq(chaptersTable.userId, userId)));
  if (!chapter) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(chaptersTable).where(eq(chaptersTable.id, id));
  res.status(204).send();
});

export default router;
