import { Router } from "express";
import { db, worldEntitiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getUserId } from "../middlewares/identity";

const router = Router({ mergeParams: true });

// mergeParams:true means the parent route's :documentId is available here, but
// Express's types don't know that — type the param access explicitly.
type WorldParams = { documentId?: string; entityId?: string };
const getParam = (req: { params: WorldParams }, key: keyof WorldParams): number => {
  const raw = req.params[key];
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
};

function serializeEntity(e: any) {
  return {
    id: e.id,
    documentId: e.documentId,
    type: e.type,
    name: e.name,
    fields: e.fields,
    imageUrl: e.imageUrl,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : e.updatedAt,
  };
}

function validateEntityInput(body: any): { valid: boolean; data?: any; error?: string } {
  if (!body.type || !["character", "place", "item"].includes(body.type)) return { valid: false, error: "type must be character, place, or item" };
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) return { valid: false, error: "name is required" };
  return { valid: true, data: { type: body.type, name: body.name.trim(), fields: body.fields || {}, imageUrl: body.imageUrl ?? null } };
}

// GET /api/world/:documentId/entities
router.get("/", async (req, res) => {
  const documentId = getParam(req, "documentId");
  if (isNaN(documentId)) { res.status(400).json({ error: "Invalid document ID" }); return; }
  const userId = getUserId(req);
  const typeFilter = req.query.type as string | undefined;
  const entities = await db.select().from(worldEntitiesTable)
    .where(and(eq(worldEntitiesTable.documentId, documentId), eq(worldEntitiesTable.userId, userId)));
  const filtered = typeFilter ? entities.filter(e => e.type === typeFilter) : entities;
  res.json(filtered.map(serializeEntity));
});

// POST /api/world/:documentId/entities
router.post("/", async (req, res) => {
  const documentId = getParam(req, "documentId");
  if (isNaN(documentId)) { res.status(400).json({ error: "Invalid document ID" }); return; }
  const parsed = validateEntityInput(req.body);
  if (!parsed.valid) { res.status(400).json({ error: parsed.error }); return; }
  const userId = getUserId(req);
  const [entity] = await db.insert(worldEntitiesTable)
    .values({ documentId, userId, ...parsed.data })
    .returning();
  res.status(201).json(serializeEntity(entity));
});

// PATCH /api/world/:documentId/entities/:entityId
router.patch("/:entityId", async (req, res) => {
  const documentId = getParam(req, "documentId");
  const entityId = Number(req.params.entityId);
  if (isNaN(documentId) || isNaN(entityId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = getUserId(req);
  const updates: any = { updatedAt: new Date() };
  if (req.body.name && typeof req.body.name === "string") updates.name = req.body.name.trim();
  if (req.body.fields !== undefined) updates.fields = req.body.fields;
  if (req.body.imageUrl !== undefined) updates.imageUrl = req.body.imageUrl;
  const [entity] = await db.update(worldEntitiesTable).set(updates)
    .where(and(eq(worldEntitiesTable.id, entityId), eq(worldEntitiesTable.documentId, documentId), eq(worldEntitiesTable.userId, userId)))
    .returning();
  if (!entity) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeEntity(entity));
});

// DELETE /api/world/:documentId/entities/:entityId
router.delete("/:entityId", async (req, res) => {
  const documentId = getParam(req, "documentId");
  const entityId = Number(req.params.entityId);
  if (isNaN(documentId) || isNaN(entityId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const userId = getUserId(req);
  await db.delete(worldEntitiesTable)
    .where(and(eq(worldEntitiesTable.id, entityId), eq(worldEntitiesTable.documentId, documentId), eq(worldEntitiesTable.userId, userId)));
  res.status(204).send();
});

export default router;
