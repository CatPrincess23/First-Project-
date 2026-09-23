-- Apply once to the existing production database after backing up the schema.
-- Orphaned conversations cannot be attached to a document and are inaccessible
-- through the document-scoped API, so remove them before creating the FK.
BEGIN;

DELETE FROM conversations AS c
WHERE NOT EXISTS (
  SELECT 1 FROM documents AS d WHERE d.id = c.document_id
);

ALTER TABLE conversations
  ADD CONSTRAINT conversations_document_id_documents_id_fk
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

ALTER TABLE messages
  ADD CONSTRAINT messages_role_check
  CHECK (role IN ('user', 'assistant'));

COMMIT;
