// server.js: serves the browser UI and the REST API.
const path = require("path");
const express = require("express");
const multer = require("multer");
const db = require("./db");
const storage = require("./storage");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Keep uploads in memory and cap them at 10 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const isId = (value) => /^\d+$/.test(value);

// Health check used by Kubernetes readiness probes and by you when testing.
app.get("/api/health", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "database unavailable" });
  }
});

// List notes, newest first.
app.get("/api/notes", async (req, res) => {
  const { rows } = await db.query(
    "SELECT id, title, body, created_at FROM notes ORDER BY created_at DESC LIMIT 200"
  );
  res.json(rows);
});

// Create a note.
app.post("/api/notes", async (req, res) => {
  const title = String(req.body.title || "").trim();
  const body = String(req.body.body || "");
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
  const { rows } = await db.query(
    "INSERT INTO notes (title, body) VALUES ($1, $2) RETURNING id, title, body, created_at",
    [title, body]
  );
  res.status(201).json(rows[0]);
});

// Get one note with its attachment list.
app.get("/api/notes/:id", async (req, res) => {
  if (!isId(req.params.id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const note = await db.query(
    "SELECT id, title, body, created_at FROM notes WHERE id = $1",
    [req.params.id]
  );
  if (!note.rows[0]) {
    return res.status(404).json({ error: "note not found" });
  }
  const files = await db.query(
    "SELECT id, filename, content_type, size_bytes FROM attachments WHERE note_id = $1 ORDER BY id",
    [req.params.id]
  );
  res.json({ ...note.rows[0], attachments: files.rows });
});

// Delete a note, its attachment files in Object Storage, and its rows.
app.delete("/api/notes/:id", async (req, res) => {
  if (!isId(req.params.id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const files = await db.query(
    "SELECT object_name FROM attachments WHERE note_id = $1",
    [req.params.id]
  );
  for (const f of files.rows) {
    await storage.deleteObject(f.object_name);
  }
  const result = await db.query("DELETE FROM notes WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "note not found" });
  }
  res.status(204).end();
});

// Upload a file and attach it to a note. The file goes to Object Storage;
// only its metadata goes into PostgreSQL.
app.post("/api/notes/:id/attachments", upload.single("file"), async (req, res) => {
  if (!isId(req.params.id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "file is required" });
  }
  const exists = await db.query("SELECT 1 FROM notes WHERE id = $1", [req.params.id]);
  if (!exists.rows[0]) {
    return res.status(404).json({ error: "note not found" });
  }
  const objectName = await storage.putObject(
    req.file.buffer,
    req.file.mimetype,
    req.file.originalname
  );
  const { rows } = await db.query(
    `INSERT INTO attachments (note_id, object_name, filename, content_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, filename, content_type, size_bytes`,
    [req.params.id, objectName, req.file.originalname, req.file.mimetype, req.file.size]
  );
  res.status(201).json(rows[0]);
});

// Download an attachment. The app reads it from Object Storage and streams it
// to the browser. The browser never talks to Object Storage directly.
app.get("/api/attachments/:id", async (req, res) => {
  if (!isId(req.params.id)) {
    return res.status(400).json({ error: "invalid id" });
  }
  const { rows } = await db.query(
    "SELECT object_name, filename, content_type FROM attachments WHERE id = $1",
    [req.params.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: "attachment not found" });
  }
  const file = rows[0];
  const stream = await storage.getObjectStream(file.object_name);
  res.setHeader("Content-Type", file.content_type);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${file.filename.replace(/"/g, "")}"`
  );
  stream.pipe(res);
});

// Last-resort error handler. Log the detail on the server, but send the browser
// only a generic message so database internals are never exposed.
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "file too large (maximum 10 MB)" });
  }
  console.error(err);
  res.status(500).json({ error: "internal error" });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`notes-app listening on port ${port}`);
});
