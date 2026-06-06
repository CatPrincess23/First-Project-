import express from "express";
import cors from "cors";

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());

let nextId = 1;
const docs = new Map<number, any>();

function serializeDoc(d: any) {
  return { ...d };
}

app.get("/api/documents/stats", (_req, res) => {
  const all = [...docs.values()];
  const totalWords = all.reduce((s, d) => s + (d.wordCount || 0), 0);
  res.json({
    totalDocuments: all.length,
    totalWords,
    recentDocuments: all.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5).map(serializeDoc),
  });
});

app.get("/api/documents", (_req, res) => {
  res.json([...docs.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map(serializeDoc));
});

app.post("/api/documents", (req, res) => {
  const { title = "Untitled Document", content = "" } = req.body;
  const now = new Date().toISOString();
  const doc = {
    id: nextId++,
    title,
    content,
    wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
    goalWordCount: null,
    createdAt: now,
    updatedAt: now,
    userId: req.headers["x-guest-id"] || "guest",
  };
  docs.set(doc.id, doc);
  res.status(201).json(serializeDoc(doc));
});

app.get("/api/documents/:id", (req, res) => {
  const doc = docs.get(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(serializeDoc(doc));
});

app.patch("/api/documents/:id", (req, res) => {
  const doc = docs.get(Number(req.params.id));
  if (!doc) return res.status(404).json({ error: "Not found" });
  const { title, content, goalWordCount } = req.body;
  if (title !== undefined) doc.title = title;
  if (content !== undefined) {
    doc.content = content;
    doc.wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  }
  if (goalWordCount !== undefined) doc.goalWordCount = goalWordCount;
  doc.updatedAt = new Date().toISOString();
  res.json(serializeDoc(doc));
});

app.delete("/api/documents/:id", (req, res) => {
  docs.delete(Number(req.params.id));
  res.status(204).send();
});

// World entities
const entities = new Map<number, any>();
let nextEntityId = 1;

app.get("/api/world/:documentId", (req, res) => {
  const documentId = Number(req.params.documentId);
  res.json([...entities.values()].filter(e => e.documentId === documentId).map(serializeDoc));
});

app.post("/api/world", (req, res) => {
  const entity = { id: nextEntityId++, ...req.body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  entities.set(entity.id, entity);
  res.status(201).json(serializeDoc(entity));
});

app.patch("/api/world/:id", (req, res) => {
  const entity = entities.get(Number(req.params.id));
  if (!entity) return res.status(404).json({ error: "Not found" });
  Object.assign(entity, req.body, { updatedAt: new Date().toISOString() });
  res.json(serializeDoc(entity));
});

app.delete("/api/world/:id", (req, res) => {
  entities.delete(Number(req.params.id));
  res.status(204).send();
});

app.listen(port, () => {
  console.log(`Mock API server listening on port ${port}`);
});
