import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  userId: text("user_id").notNull(),
  wordCount: integer("word_count").notNull().default(0),
  goalWordCount: integer("goal_word_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const updateDocumentSchema = createUpdateSchema(documentsTable).omit({ id: true, userId: true, createdAt: true, updatedAt: true });

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;

// World-building entities (characters, places, items) per document
export const worldEntitiesTable = pgTable("world_entities", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // "character" | "place" | "item"
  name: text("name").notNull(),
  fields: jsonb("fields").notNull().default({}),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWorldEntitySchema = createInsertSchema(worldEntitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const updateWorldEntitySchema = createUpdateSchema(worldEntitiesTable).omit({ id: true, documentId: true, userId: true, createdAt: true, updatedAt: true });

export type WorldEntity = typeof worldEntitiesTable.$inferSelect;
export type InsertWorldEntity = z.infer<typeof insertWorldEntitySchema>;

// Document version history
export const documentVersionsTable = pgTable("document_versions", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  wordCount: integer("word_count").notNull().default(0),
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DocumentVersion = typeof documentVersionsTable.$inferSelect;

// Chapters — a document is split into ordered chapters. Each chapter holds its
// own HTML content, so the editor edits one chapter at a time and AI features
// (grammar / rewrite / chat) run per-chapter instead of over the whole doc.
export const chaptersTable = pgTable("chapters", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documentsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("Untitled Chapter"),
  content: text("content").notNull().default(""),
  position: integer("position").notNull().default(0),
  wordCount: integer("word_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Chapter = typeof chaptersTable.$inferSelect;
