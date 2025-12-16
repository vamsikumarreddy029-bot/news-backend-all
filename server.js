import express from "express";
import sqlite3 from "sqlite3";
import crypto from "crypto";
import cors from "cors";

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

function clean(t = "") {
  return t
    .replace(/<[^>]+>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeHash(t, s) {
  return crypto.createHash("sha1").update(t + s).digest("hex");
}

/* ================= INGEST ================= */

app.post("/api/news/raw", (req, res) => {
  const { title, summary, category } = req.body;

  // 🔥 RELAXED RULES (OPTION A)
  if (!title || !summary) {
    return res.json({ skipped: "missing" });
  }

  const t = clean(title);
  const s = clean(summary);

  // ❌ Only block if EXACT copy
  if (s === t) {
    return res.json({ skipped: "same-as-title" });
  }

  const hash = makeHash(t, s);

  db.run(
    `INSERT OR IGNORE INTO news
     (title, summary, category, hash, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [t, s, category || "State", hash, Date.now()],
    function () {
      if (this.changes === 0) {
        return res.json({ skipped: "duplicate" });
      }
      res.json({ saved: true });
    }
  );
});

/* ================= FEED ================= */

app.get("/api/feed", (req, res) => {
  db.all(
    `SELECT title, summary, category, createdAt
     FROM news
     WHERE createdAt > ?
     ORDER BY id DESC
     LIMIT 100`,
    [Date.now() - 30 * 60 * 60 * 1000], // 30 hours
    (_, rows) => res.json(rows)
  );
});

/* ================= START ================= */

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () =>
  console.log("✅ Backend running on", PORT)
);
