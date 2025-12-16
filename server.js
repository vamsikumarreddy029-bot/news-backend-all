import express from "express";
import sqlite3 from "sqlite3";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

/* ================= DB ================= */

const db = new sqlite3.Database("./news.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      summary TEXT,
      category TEXT,
      hash TEXT UNIQUE,
      createdAt INTEGER
    )
  `);
});

/* ================= HELPERS ================= */

function cleanText(t = "") {
  return t
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeHash(t, s) {
  return crypto.createHash("sha1").update(t + s).digest("hex");
}

/* ================= INGEST ================= */

app.post("/api/news/raw", (req, res) => {
  const { title, summary, category } = req.body;
  if (!title || !summary || !category) {
    return res.json({ skip: true });
  }

  const t = cleanText(title);
  const s = cleanText(summary);
  const hash = makeHash(t, s);

  db.run(
    `INSERT OR IGNORE INTO news (title, summary, category, hash, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [t, s, category, hash, Date.now()],
    () => res.json({ saved: true })
  );
});

/* ================= FEED ================= */

app.get("/api/feed", (req, res) => {
  db.all(
    `SELECT title, summary, category, createdAt
     FROM news
     WHERE createdAt > ?
     ORDER BY createdAt DESC`,
    [Date.now() - 30 * 60 * 60 * 1000], // 30 hours
    (_, rows) => res.json(rows)
  );
});

/* ================= ADMIN ================= */

app.delete("/api/admin/delete/:id", (req, res) => {
  db.run(`DELETE FROM news WHERE id=?`, [req.params.id], () =>
    res.json({ deleted: true })
  );
});

app.put("/api/admin/edit/:id", (req, res) => {
  const { title, summary, category } = req.body;
  db.run(
    `UPDATE news SET title=?, summary=?, category=? WHERE id=?`,
    [title, summary, category, req.params.id],
    () => res.json({ updated: true })
  );
});

/* ================= START ================= */

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log("✅ news-backend-all running on", PORT)
);
