-- schema.sql: run once by an administrator in the "notes" database.

-- pgvector: stores embeddings for AI similarity search.
-- The extension must already be enabled on the database system (see Part C).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS notes (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  -- Reserved for semantic search. The app does not fill it yet.
  -- 384 must match the dimension of the embedding model you choose later.
  embedding   vector(384),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
  id            BIGSERIAL PRIMARY KEY,
  note_id       BIGINT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  object_name   TEXT NOT NULL,   -- the key of the file in Object Storage
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachments_note_id_idx ON attachments (note_id);

-- Example of the similarity query you will use later (uncomment after you
-- store embeddings). <=> is cosine distance in pgvector.
-- SELECT id, title FROM notes ORDER BY embedding <=> '[0.1, 0.2, ...]' LIMIT 5;
