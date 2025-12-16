import express from "express";
import sqlite3 from "sqlite3";
import cors from "cors";
import crypto from "crypto";
import fs from "fs";
import path from "path";

/* ================= APP ================= */

const app = express();
app.use(cors());
app.use(express.json());

/* ================= DB (Railway-safe) ================= */

// Railway filesystem is ephemeral — this is OK
const DB_PATH = path.join(process.cwd(), "news.db");

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS raw_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      summary TEXT,
      hash TEXT UNIQUE,
      createdAt TEXT
    )
  `);
});

/* ================= HELPERS ================= */

function cleanText(text = "") {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeHash(title, summary) {
  return crypto
    .createHash("sha1")
    .update(title + summary)
    .digest("hex");
}

/* ================= HEALTH ================= */

app.get("/", (req, res) => {
  res.send("✅ news-backend-all API running");
});

/* ================= INGEST (FROM WORKER) ================= */

app.post("/api/news/raw", (req, res) => {
  const { title, summary } = req.body;

  if (!title || !summary) {
    return res.json({ skip: true });
  }

  const t = cleanText(title);
  const s = cleanText(summary);
  const hash = makeHash(t, s);

  db.run(
    `
    INSERT OR IGNORE INTO raw_posts
    (title, summary, hash, createdAt)
    VALUES (?, ?, ?, ?)
    `,
    [t, s, hash, new Date().toISOString()],
    function () {
      res.json({ saved: this.changes === 1 });
    }
  );
});

/* ================= FEED ================= */

app.get("/api/feed", (req, res) => {
  db.all(
    `
    SELECT title, summary, createdAt
    FROM raw_posts
    ORDER BY id DESC
    LIMIT 100
    `,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

/* ================= START ================= */

const PORT = process.env.PORT || 8081;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ news-backend-all running on port ${PORT}`);
});
