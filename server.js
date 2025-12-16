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

function isGeneric(summary) {
  return /ఈ ఘటనకు సంబంధించిన తాజా పరిణామాలు/.test(summary);
}

/* ================= INGEST ================= */

app.post("/api/news/raw", (req, res) => {
  let { title, summary, category } = req.body;

  if (!title || !summary) {
    return res.json({ skipped: "missing" });
  }

  title = clean(title);
  summary = clean(summary);

  if (summary.length < 60) {
    return res.json({ skipped: "too-short" });
  }

  if (summary === title) {
    return res.json({ skipped: "same-as-title" });
  }

  if (isGeneric(summary)) {
    return res.json({ skipped: "generic-summary" });
  }

  const hash = makeHash(title, summary);

  db.run(
    `INSERT OR IGNORE INTO news
     (title, summary, category, hash, createdAt)
     VALUES (?, ?, ?, ?, ?)`,
    [title, summary, category || "State", hash, Date.now()],
    function () {
      if (this.changes === 0) {
        return res.json({ skipped: "duplicate" });
      }
      return res.json({ saved: true });
    }
  );
});

/* ================= FEED ================= */

app.get("/api/feed", (req, res) => {
  db.all(
    `SELECT title, summary, category, createdAt
     FROM news
     WHERE createdAt > ?
     ORDER BY createdAt DESC
     LIMIT 100`,
    [Date.now() - 30 * 60 * 60 * 1000],
    (_, rows) => res.json(rows)
  );
});

/* ================= HEALTH ================= */

app.get("/", (_, res) => {
  res.send("OK");
});

/* ================= START ================= */

const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ news-backend-all running on", PORT);
});
